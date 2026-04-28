// Sincroniza partidos con Football-Data.org
// Actualiza marcador/estado y sincroniza eventos (goles + tarjetas) en match_events.
// Registra cada ejecución en sync_logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

function mapStatus(s: string): "scheduled" | "live" | "finished" {
  switch (s) {
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    default:
      return "scheduled";
  }
}

function teamSide(eventTeamId: number, homeId: number): "home" | "away" {
  return eventTeamId === homeId ? "home" : "away";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Crear log row
  const { data: logRow } = await admin
    .from("sync_logs")
    .insert({ function_name: "sync-live-matches", status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  async function finishLog(patch: Record<string, unknown>) {
    if (!logId) return;
    await admin.from("sync_logs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", logId);
  }

  try {
    const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
    if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not configured");

    const { data: matches, error } = await admin
      .from("matches")
      .select("id, external_id, status")
      .like("external_id", "fd-%");

    if (error) throw error;
    if (!matches || matches.length === 0) {
      await finishLog({ status: "success", updated_count: 0, details: { message: "no linked matches" } });
      return new Response(
        JSON.stringify({ updated: 0, message: "No hay partidos vinculados a Football-Data." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ id: string; ok: boolean; status?: string; score?: string; events?: number; error?: string }> = [];

    for (const m of matches) {
      const fdId = m.external_id!.replace(/^fd-/, "");
      try {
        const r = await fetch(`${FD_BASE}/matches/${fdId}`, {
          headers: { "X-Auth-Token": apiKey },
        });
        if (!r.ok) {
          results.push({ id: m.id, ok: false, error: `HTTP ${r.status}` });
          continue;
        }
        const data = await r.json();
        const match = data.match ?? data;
        const newStatus = mapStatus(match.status);
        const score_a = match.score?.fullTime?.home ?? null;
        const score_b = match.score?.fullTime?.away ?? null;

        const { error: upErr } = await admin
          .from("matches")
          .update({
            status: newStatus,
            score_a,
            score_b,
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
        if (upErr) throw upErr;

        const homeId: number | undefined = match.homeTeam?.id;
        const events: Array<Record<string, unknown>> = [];

        const goals = Array.isArray(match.goals) ? match.goals : [];
        for (let i = 0; i < goals.length; i++) {
          const g = goals[i];
          const minute = g.minute ?? 0;
          const teamId = g.team?.id;
          if (!teamId || homeId === undefined) continue;
          const player = g.scorer?.name ?? "—";
          events.push({
            match_id: m.id,
            minute,
            type: "goal",
            team: teamSide(teamId, homeId),
            player,
            score_home: g.score?.home ?? null,
            score_away: g.score?.away ?? null,
            external_id: `${m.external_id}-goal-${i}-${minute}-${player}`.slice(0, 200),
          });
        }

        const bookings = Array.isArray(match.bookings) ? match.bookings : [];
        for (let i = 0; i < bookings.length; i++) {
          const b = bookings[i];
          const minute = b.minute ?? 0;
          const teamId = b.team?.id;
          if (!teamId || homeId === undefined) continue;
          const card = (b.card ?? "").toUpperCase();
          const type = card === "RED" || card === "RED_CARD" ? "red_card" : "yellow_card";
          const player = b.player?.name ?? "—";
          events.push({
            match_id: m.id,
            minute,
            type,
            team: teamSide(teamId, homeId),
            player,
            score_home: null,
            score_away: null,
            external_id: `${m.external_id}-${type}-${i}-${minute}-${player}`.slice(0, 200),
          });
        }

        let evCount = 0;
        if (events.length > 0) {
          const { error: evErr } = await admin
            .from("match_events")
            .upsert(events, { onConflict: "external_id" });
          if (evErr) {
            console.error("event upsert error", evErr);
          } else {
            evCount = events.length;
          }
        }

        results.push({
          id: m.id,
          ok: true,
          status: newStatus,
          score: `${score_a ?? 0}-${score_b ?? 0}`,
          events: evCount,
        });
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const errCount = results.length - okCount;
    await finishLog({
      status: errCount === 0 ? "success" : okCount === 0 ? "error" : "partial",
      updated_count: okCount,
      details: { results },
      error_message: errCount > 0 ? `${errCount} partidos fallaron` : null,
    });

    return new Response(
      JSON.stringify({ updated: okCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-live-matches error:", e);
    await finishLog({ status: "error", error_message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
