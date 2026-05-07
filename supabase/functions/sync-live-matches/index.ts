// Sync con Football-Data: marca live + finalize en momentos clave. (v2 — live + finalize)
//
// Ventanas de chequeo por partido (relativo al kickoff):
//   -5, 0, +5 min  → para detectar arranque (status='live')
//   +115, +120, +125 min → para detectar final (status='finished', score 90')
//
// El cron corre cada 1 min. La query SQL se autoprotege: si no hay candidatos,
// retorna instantáneamente sin gastar cuota de Football-Data.
//
// Reglas de extracción del resultado final (90'):
//   1. score.regularTime.{home,away} si existe.
//   2. score.fullTime si duration === 'REGULAR'.
//   3. Si no, se ignora (se reintenta en próximo tick).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

function extractRegular90(score: any): { a: number | null; b: number | null } {
  const reg = score?.regularTime;
  if (reg && reg.home != null && reg.away != null) {
    return { a: Number(reg.home), b: Number(reg.away) };
  }
  const duration = (score?.duration ?? "").toUpperCase();
  if (duration === "REGULAR") {
    const ft = score?.fullTime;
    if (ft && ft.home != null && ft.away != null) {
      return { a: Number(ft.home), b: Number(ft.away) };
    }
  }
  return { a: null, b: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: logRow } = await admin
    .from("sync_logs")
    .insert({ function_name: "sync-live-matches", status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  async function finishLog(patch: Record<string, unknown>) {
    if (!logId) return;
    await admin
      .from("sync_logs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", logId);
  }

  if (!apiKey) {
    await finishLog({ status: "error", error_message: "FOOTBALL_DATA_API_KEY no configurada" });
    return new Response(JSON.stringify({ error: "FOOTBALL_DATA_API_KEY no configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    // Ventana LIVE: kickoff entre -7 min y +7 min (cubre -5, 0, +5 con tolerancia).
    const liveStart = new Date(now.getTime() - 7 * 60 * 1000).toISOString();
    const liveEnd = new Date(now.getTime() + 7 * 60 * 1000).toISOString();
    // Ventana FINALIZE: kickoff entre -127 min y -113 min (cubre +115, +120, +125).
    const finStart = new Date(now.getTime() - 127 * 60 * 1000).toISOString();
    const finEnd = new Date(now.getTime() - 113 * 60 * 1000).toISOString();

    const { data: candidates } = await admin
      .from("matches")
      .select("id, team_a, team_b, external_id, status, kickoff_at")
      .neq("status", "finished")
      .eq("test_mode", false)
      .not("external_id", "is", null)
      .or(
        `and(kickoff_at.gte.${liveStart},kickoff_at.lte.${liveEnd}),` +
        `and(kickoff_at.gte.${finStart},kickoff_at.lte.${finEnd})`,
      );

    const matches = candidates ?? [];
    console.log(`[sync] now=${now.toISOString()} candidates=${matches.length}`, matches.map((m: any) => `${m.team_a} vs ${m.team_b} (${m.status}) ko=${m.kickoff_at}`));

    if (matches.length === 0) {
      await finishLog({
        status: "success",
        updated_count: 0,
        details: { message: "no matches in any window", checked_at: now.toISOString() },
      });
      return new Response(
        JSON.stringify({ updated: 0, message: "Sin partidos en ventana." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<Record<string, unknown>> = [];
    const DELAY_MS = 6500;

    async function checkOne(m: any) {
      const fdId = (m.external_id ?? "").replace(/^fd-/, "");
      if (!fdId) return { ok: false, error: "external_id sin prefijo fd-" };
      const r = await fetch(`${FD_BASE}/matches/${fdId}`, { headers: { "X-Auth-Token": apiKey } });
      if (!r.ok) {
        const txt = await r.text();
        return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 120)}` };
      }
      const data = await r.json();
      const upstream = (data.status ?? "").toUpperCase();

      const isLive = upstream === "IN_PLAY" || upstream === "PAUSED";
      const isFinished = upstream === "FINISHED" || upstream === "AWARDED";

      if (isFinished) {
        const { a, b } = extractRegular90(data.score);
        if (a == null || b == null) {
          return { ok: false, upstream, error: "FINISHED sin regularTime/fullTime válido" };
        }
        const { error: upErr } = await admin
          .from("matches")
          .update({
            status: "finished",
            score_a: a,
            score_b: b,
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
        if (upErr) return { ok: false, error: upErr.message };
        return { ok: true, action: "finalized", upstream, score: `${a}-${b}` };
      }

      if (isLive && m.status !== "live") {
        const { error: upErr } = await admin
          .from("matches")
          .update({ status: "live", updated_at: new Date().toISOString() })
          .eq("id", m.id);
        if (upErr) return { ok: false, error: upErr.message };
        return { ok: true, action: "marked-live", upstream };
      }

      return { ok: true, action: "noop", upstream };
    }

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      try {
        const res = await checkOne(m);
        results.push({ id: m.id, kickoff_at: m.kickoff_at, ...(res as any) });
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      if (i < matches.length - 1) {
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }

    const finalized = results.filter((r) => (r as any).action === "finalized").length;
    const liveMarked = results.filter((r) => (r as any).action === "marked-live").length;
    const errCount = results.filter((r) => !(r as any).ok).length;

    await finishLog({
      status: errCount === 0 ? "success" : (finalized + liveMarked) === 0 ? "error" : "partial",
      updated_count: finalized + liveMarked,
      details: { results, provider: "football-data", finalized, liveMarked },
      error_message: errCount > 0 ? `${errCount} chequeos fallidos` : null,
    });

    return new Response(JSON.stringify({ updated: finalized + liveMarked, finalized, liveMarked, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
