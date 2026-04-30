// One-shot: importa el fixture del Mundial 2026 + UCL próxima semana
// y configura las ventanas de pronóstico por fase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

const STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_32: "Dieciseisavos",
  LAST_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinal",
  THIRD_PLACE: "Tercer Puesto",
  FINAL: "Final",
};

// Ventanas de pronóstico (timestamps ISO en UTC; ART = UTC-3)
const WINDOWS = [
  { id: "wc-md1", label: "Fecha 1 - Grupos", opens_at: "2026-05-31T03:00:00Z", closes_at: "2026-06-11T02:59:59Z", sort_order: 1 },
  { id: "wc-md2", label: "Fecha 2 - Grupos", opens_at: "2026-06-11T03:00:00Z", closes_at: "2026-06-18T02:59:59Z", sort_order: 2 },
  { id: "wc-md3", label: "Fecha 3 - Grupos", opens_at: "2026-06-18T03:00:00Z", closes_at: "2026-06-24T02:59:59Z", sort_order: 3 },
  { id: "wc-r32", label: "Dieciseisavos de final", opens_at: "2026-06-24T03:00:00Z", closes_at: "2026-06-28T02:59:59Z", sort_order: 4 },
  { id: "wc-r16", label: "Octavos de final", opens_at: "2026-06-28T03:00:00Z", closes_at: "2026-07-04T02:59:59Z", sort_order: 5 },
  { id: "wc-qf", label: "Cuartos de final", opens_at: "2026-07-04T03:00:00Z", closes_at: "2026-07-09T02:59:59Z", sort_order: 6 },
  { id: "wc-sf", label: "Semifinales", opens_at: "2026-07-09T03:00:00Z", closes_at: "2026-07-14T02:59:59Z", sort_order: 7 },
  { id: "wc-final", label: "Final y Tercer puesto", opens_at: "2026-07-14T03:00:00Z", closes_at: "2026-07-20T02:59:59Z", sort_order: 8 },
];

function windowForWcMatch(stage: string, matchday: number | null): string | null {
  if (stage === "GROUP_STAGE") {
    if (matchday === 1) return "wc-md1";
    if (matchday === 2) return "wc-md2";
    if (matchday === 3) return "wc-md3";
    return "wc-md1";
  }
  if (stage === "LAST_32") return "wc-r32";
  if (stage === "LAST_16") return "wc-r16";
  if (stage === "QUARTER_FINALS") return "wc-qf";
  if (stage === "SEMI_FINALS") return "wc-sf";
  if (stage === "FINAL" || stage === "THIRD_PLACE") return "wc-final";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "FOOTBALL_DATA_API_KEY no configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Insertar ventanas (idempotente)
    const { error: wErr } = await admin
      .from("prediction_windows")
      .upsert(WINDOWS, { onConflict: "id" });
    if (wErr) throw wErr;

    // 2. Traer Mundial completo
    const wcRes = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!wcRes.ok) throw new Error(`WC fetch ${wcRes.status}: ${await wcRes.text()}`);
    const wcData = await wcRes.json();
    const wcMatches = wcData.matches ?? [];

    const normalizeGroup = (g: string | null | undefined): string | null => {
      if (!g) return null;
      const m = g.match(/^GROUP[_\s]?([A-Z])$/i);
      return m ? `Grupo ${m[1].toUpperCase()}` : g;
    };

    const wcRows = wcMatches.map((m: any) => ({
      external_id: `fd-${m.id}`,
      stage: STAGE_LABEL[m.stage] ?? m.stage,
      group_name: normalizeGroup(m.group),
      team_a: m.homeTeam?.name ?? "TBD",
      team_b: m.awayTeam?.name ?? "TBD",
      team_a_flag: m.homeTeam?.crest ?? null,
      team_b_flag: m.awayTeam?.crest ?? null,
      kickoff_at: m.utcDate,
      status: "scheduled",
      prediction_window_id: windowForWcMatch(m.stage, m.matchday),
      predictions_lock_mode: "auto",
      test_mode: false,
    }));

    // 3. Esperar 6.5s para no pegarle al rate-limit (10 req/min free tier)
    await new Promise((r) => setTimeout(r, 6500));

    // 4. UCL próxima semana
    const today = new Date();
    const inAWeek = new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const uclRes = await fetch(
      `${FD_BASE}/competitions/CL/matches?dateFrom=${fmt(today)}&dateTo=${fmt(inAWeek)}`,
      { headers: { "X-Auth-Token": apiKey } },
    );
    if (!uclRes.ok) throw new Error(`UCL fetch ${uclRes.status}: ${await uclRes.text()}`);
    const uclData = await uclRes.json();
    const uclMatches = uclData.matches ?? [];

    const uclRows = uclMatches.map((m: any) => ({
      external_id: `fd-${m.id}`,
      stage: `UEFA Champions League - ${STAGE_LABEL[m.stage] ?? m.stage}`,
      group_name: null,
      team_a: m.homeTeam?.name ?? "TBD",
      team_b: m.awayTeam?.name ?? "TBD",
      team_a_flag: m.homeTeam?.crest ?? null,
      team_b_flag: m.awayTeam?.crest ?? null,
      kickoff_at: m.utcDate,
      status: "scheduled",
      prediction_window_id: null,
      predictions_lock_mode: "auto",
      test_mode: false,
    }));

    // 5. Upsert por external_id
    const allRows = [...wcRows, ...uclRows];
    const { error: mErr } = await admin
      .from("matches")
      .upsert(allRows, { onConflict: "external_id" });
    if (mErr) throw mErr;

    return new Response(
      JSON.stringify({
        ok: true,
        windows: WINDOWS.length,
        wc_inserted: wcRows.length,
        ucl_inserted: uclRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("import-fixtures error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
