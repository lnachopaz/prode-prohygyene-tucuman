// Sincroniza partidos en vivo / próximos con Football-Data.org.
// Usa external_id (formato "fd-<id>") para llamar 1 vez por partido relevante.
// Actualiza marcador, estado y goleadores. Registra cada ejecución en sync_logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

// Mapea status de Football-Data a nuestro enum
function mapStatus(s: string | null | undefined): "scheduled" | "live" | "finished" {
  if (!s) return "scheduled";
  const v = s.toUpperCase();
  if (["FINISHED", "AWARDED"].includes(v)) return "finished";
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(v)) return "live";
  return "scheduled";
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
    // Sincronizamos solo partidos relevantes:
    // - status 'live'
    // - status 'scheduled' que arrancan dentro de 30 min, o iniciados hasta hace 4h
    const now = new Date();
    const nowIso = now.toISOString();
    const soonIso = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const recentPastIso = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

    // Excluimos partidos en modo prueba: el admin los maneja manualmente.
    const { data: liveMatches } = await admin
      .from("matches")
      .select("id, team_a, team_b, external_id, status")
      .eq("status", "live")
      .eq("test_mode", false)
      .not("external_id", "is", null);

    const { data: soonMatches } = await admin
      .from("matches")
      .select("id, team_a, team_b, external_id, status")
      .eq("status", "scheduled")
      .eq("test_mode", false)
      .gte("kickoff_at", recentPastIso)
      .lte("kickoff_at", soonIso)
      .not("external_id", "is", null);

    const seen = new Set<string>();
    const matches = [...(liveMatches ?? []), ...(soonMatches ?? [])].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // ==========================================
    // BUSCAR PARTIDOS UCL HOY (Champions League)
    // ==========================================
    // Si hoy hay partidos de Champions League, los agregamos automáticamente
    // si no existen en la base de datos.

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    try {
      // Buscar competiciones de UEFA Champions League
      const competitionsRes = await fetch(`${FD_BASE}/competitions`, {
        headers: { "X-Auth-Token": apiKey },
      });

      if (competitionsRes.ok) {
        const competitionsData = await competitionsRes.json();
        const uclCompetition = competitionsData.competitions?.find(
          (c: any) => c.code === "CL" || c.name?.includes("Champions League"),
        );

        if (uclCompetition) {
          // Buscar partidos de la UCL de hoy
          const uclMatchesRes = await fetch(
            `${FD_BASE}/competitions/CL/matches?dateFrom=${todayStart}&dateTo=${todayEnd}`,
            {
              headers: { "X-Auth-Token": apiKey },
            },
          );

          if (uclMatchesRes.ok) {
            const uclMatchesData = await uclMatchesRes.json();
            const uclMatches = uclMatchesData.matches ?? [];

            for (const match of uclMatches) {
              const externalId = `fd-${match.id}`;

              // Verificar si ya existe en nuestra BD
              const { data: existing } = await admin
                .from("matches")
                .select("id")
                .eq("external_id", externalId)
                .maybeSingle();

              if (!existing) {
                // No existe, lo creamos
                const newStatus = mapStatus(match.status);
                const score_a = match.score?.fullTime?.home ?? null;
                const score_b = match.score?.fullTime?.away ?? null;

                // Obtener banderas de los equipos
                const teamAFlag = match.homeTeam?.crest || null;
                const teamBFlag = match.awayTeam?.crest || null;

                await admin.from("matches").insert({
                  external_id: externalId,
                  stage: match.competition?.name || "UEFA Champions League",
                  group_name: match.stage || "UCL",
                  team_a: match.homeTeam?.name || "Unknown",
                  team_b: match.awayTeam?.name || "Unknown",
                  team_a_flag: teamAFlag,
                  team_b_flag: teamBFlag,
                  kickoff_at: match.utcDate,
                  status: newStatus,
                  score_a,
                  score_b,
                  test_mode: false,
                });
              } else {
                // Ya existe, actualizamos marcador y estado
                const newStatus = mapStatus(match.status);
                const score_a = match.score?.fullTime?.home ?? null;
                const score_b = match.score?.fullTime?.away ?? null;

                await admin
                  .from("matches")
                  .update({
                    status: newStatus,
                    score_a,
                    score_b,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("external_id", externalId);
              }
            }
          }
        }
      }
    } catch (uclError) {
      console.error("Error buscando partidos UCL:", uclError);
      // Continuamos con el sync normal aunque falle la búsqueda de UCL
    }

    // ==========================================
    // FIN BÚSQUEDA UCL
    // ==========================================

    if (matches.length === 0) {
      await finishLog({
        status: "success",
        updated_count: 0,
        details: { message: "no relevant matches now", checked_at: nowIso },
      });
      return new Response(
        JSON.stringify({ updated: 0, message: "No hay partidos en vivo ni próximos a sincronizar." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ id: string; ok: boolean; status?: string; score?: string; error?: string }> = [];

    // Football-Data free: 10 req/min => 6s entre llamadas. Usamos 6.5s para margen.
    const DELAY_MS = matches.length > 1 ? 6500 : 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      try {
        const fdId = (m.external_id ?? "").replace(/^fd-/, "");
        if (!fdId) {
          results.push({ id: m.id, ok: false, error: "external_id sin prefijo fd-" });
          continue;
        }

        const r = await fetch(`${FD_BASE}/matches/${fdId}`, {
          headers: { "X-Auth-Token": apiKey },
        });

        if (!r.ok) {
          const txt = await r.text();
          results.push({ id: m.id, ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 120)}` });
        } else {
          const data = await r.json();
          const newStatus = mapStatus(data.status);
          const score_a = data.score?.fullTime?.home ?? null;
          const score_b = data.score?.fullTime?.away ?? null;

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

          results.push({
            id: m.id,
            ok: true,
            status: newStatus,
            score: `${score_a ?? 0}-${score_b ?? 0}`,
          });
        }
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }

      // Esperar antes de la siguiente llamada (excepto la última)
      if (i < matches.length - 1 && DELAY_MS > 0) {
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const errCount = results.length - okCount;
    await finishLog({
      status: errCount === 0 ? "success" : okCount === 0 ? "error" : "partial",
      updated_count: okCount,
      details: { results, provider: "football-data" },
      error_message: errCount > 0 ? `${errCount} partidos no se pudieron sincronizar` : null,
    });

    return new Response(JSON.stringify({ updated: okCount, results }), {
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
