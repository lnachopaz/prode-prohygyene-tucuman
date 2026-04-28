// Sincroniza partidos con TheSportsDB (gratis e ilimitado).
// Busca partidos por fecha y matchea por nombre de equipos.
// Actualiza marcador/estado de partidos en vivo y próximos.
// Registra cada ejecución en sync_logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// API pública gratuita. Key "3" = test key (sin límite documentado para uso razonable).
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

// Estados que TheSportsDB devuelve en strStatus
// In-play: "1H", "2H", "HT", "ET", "P" (penales), "BT" (break)
// Finished: "FT", "AET", "PEN", "Match Finished"
// Scheduled: "NS", "Not Started", "" (vacío), null
function mapStatus(s: string | null | undefined): "scheduled" | "live" | "finished" {
  if (!s) return "scheduled";
  const v = s.toUpperCase().trim();
  if (["FT", "AET", "PEN", "MATCH FINISHED", "FINISHED", "AWARDED"].includes(v)) return "finished";
  if (["NS", "NOT STARTED", "TBD", "POSTPONED", "CANCELLED", "SUSPENDED"].includes(v)) return "scheduled";
  // Cualquier otro string no vacío suele indicar partido en juego (1H, 2H, HT, ET, P, BT, "Live", etc.)
  return "live";
}

// Normaliza nombres de equipos para hacer matching robusto.
// TheSportsDB usa "Paris SG", nosotros "Paris Saint-Germain", etc.
function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/\bfc\b|\bcf\b|\bsc\b|\bac\b|\bclub\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Devuelve true si dos nombres de equipo "matchean" (uno contiene tokens claves del otro).
function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (na === nb) return true;
  // Tokens clave (ignorando palabras genéricas)
  const stop = new Set(["de", "la", "el", "los", "las", "the", "and", "y", "of", "munich", "city", "united", "real"]);
  const tokensA = na.split(" ").filter((t) => t.length >= 3 && !stop.has(t));
  const tokensB = nb.split(" ").filter((t) => t.length >= 3 && !stop.has(t));
  // Si comparten al menos un token significativo de 4+ chars
  for (const t of tokensA) {
    if (t.length >= 4 && tokensB.includes(t)) return true;
  }
  // O si uno está contenido en el otro
  return na.includes(nb) || nb.includes(na);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

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
    // Solo sincronizamos partidos relevantes:
    // - status 'live'
    // - status 'scheduled' que arrancan dentro de 30 min, o que ya arrancaron (hasta 4h atrás)
    const now = new Date();
    const nowIso = now.toISOString();
    const soonIso = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const recentPastIso = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

    const { data: liveMatches } = await admin
      .from("matches")
      .select("id, team_a, team_b, kickoff_at, status")
      .eq("status", "live");

    const { data: soonMatches } = await admin
      .from("matches")
      .select("id, team_a, team_b, kickoff_at, status")
      .eq("status", "scheduled")
      .gte("kickoff_at", recentPastIso)
      .lte("kickoff_at", soonIso);

    const seen = new Set<string>();
    const matches = [...(liveMatches ?? []), ...(soonMatches ?? [])].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    if (matches.length === 0) {
      await finishLog({ status: "success", updated_count: 0, details: { message: "no relevant matches now", checked_at: nowIso } });
      return new Response(
        JSON.stringify({ updated: 0, message: "No hay partidos en vivo ni próximos a sincronizar." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agrupar partidos por fecha (YYYY-MM-DD en UTC) para hacer 1 sola llamada por día.
    const byDate = new Map<string, typeof matches>();
    for (const m of matches) {
      const date = new Date(m.kickoff_at).toISOString().slice(0, 10);
      const arr = byDate.get(date) ?? [];
      arr.push(m);
      byDate.set(date, arr);
    }

    // Cache de eventos por fecha
    const eventsByDate = new Map<string, any[]>();
    for (const date of byDate.keys()) {
      try {
        const r = await fetch(`${TSDB_BASE}/eventsday.php?d=${date}&s=Soccer`);
        if (!r.ok) {
          eventsByDate.set(date, []);
          continue;
        }
        const data = await r.json();
        eventsByDate.set(date, Array.isArray(data?.events) ? data.events : []);
      } catch (_e) {
        eventsByDate.set(date, []);
      }
    }

    const results: Array<{ id: string; ok: boolean; status?: string; score?: string; matched?: string; error?: string }> = [];

    for (const m of matches) {
      try {
        const date = new Date(m.kickoff_at).toISOString().slice(0, 10);
        const candidates = eventsByDate.get(date) ?? [];

        // Buscar el evento donde ambos equipos matcheen
        const evt = candidates.find((e: any) => {
          const home = e.strHomeTeam ?? "";
          const away = e.strAwayTeam ?? "";
          return (
            (teamsMatch(home, m.team_a) && teamsMatch(away, m.team_b)) ||
            (teamsMatch(home, m.team_b) && teamsMatch(away, m.team_a))
          );
        });

        if (!evt) {
          results.push({ id: m.id, ok: false, error: `no match found in TheSportsDB for ${m.team_a} vs ${m.team_b} on ${date}` });
          continue;
        }

        // Determinar si estamos invertidos (away en TSDB = team_a nuestro)
        const swapped = teamsMatch(evt.strHomeTeam, m.team_b) && teamsMatch(evt.strAwayTeam, m.team_a);

        const homeScoreRaw = evt.intHomeScore;
        const awayScoreRaw = evt.intAwayScore;
        const homeScore = homeScoreRaw === null || homeScoreRaw === undefined || homeScoreRaw === "" ? null : Number(homeScoreRaw);
        const awayScore = awayScoreRaw === null || awayScoreRaw === undefined || awayScoreRaw === "" ? null : Number(awayScoreRaw);

        const score_a = swapped ? awayScore : homeScore;
        const score_b = swapped ? homeScore : awayScore;
        const newStatus = mapStatus(evt.strStatus);

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
          matched: `${evt.strHomeTeam} vs ${evt.strAwayTeam} (${evt.idEvent})`,
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
      details: { results, provider: "thesportsdb" },
      error_message: errCount > 0 ? `${errCount} partidos no se pudieron sincronizar` : null,
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
