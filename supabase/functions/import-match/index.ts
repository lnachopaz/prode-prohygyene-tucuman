// Busca partidos en football-data.org por competición y fecha.
// - Si no existe: lo inserta.
// - Si existe y algún equipo es "Por definir" / TBD: actualiza los nombres y escudos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

const TBD_NAMES = ["por definir", "tbd", "to be defined", "equipo a", "equipo b", "?"];

function isTbd(name: string | null | undefined): boolean {
  if (!name) return true;
  return TBD_NAMES.includes(name.trim().toLowerCase());
}

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

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "FOOTBALL_DATA_API_KEY no configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const competition: string = body.competition ?? "PD";
    const date: string = body.date; // formato YYYY-MM-DD

    if (!date) {
      return new Response(JSON.stringify({ error: "El campo 'date' es requerido (YYYY-MM-DD)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(
      `${FD_BASE}/competitions/${competition}/matches?dateFrom=${date}&dateTo=${date}`,
      { headers: { "X-Auth-Token": apiKey } },
    );

    if (!res.ok) {
      const txt = await res.text();
      return new Response(
        JSON.stringify({ error: `Football-data respondió ${res.status}: ${txt.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const matches = data.matches ?? [];

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({ imported: 0, updated: 0, skipped: 0, results: [], message: "No se encontraron partidos para esa fecha y competición." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{
      externalId: string; home: string; away: string; kickoff: string;
      status: "imported" | "updated" | "skipped" | "error"; reason?: string;
    }> = [];

    for (const match of matches) {
      const externalId = `fd-${match.id}`;
      const homeName = match.homeTeam?.name ?? "Equipo A";
      const awayName = match.awayTeam?.name ?? "Equipo B";
      const homeCrest = match.homeTeam?.crest ?? null;
      const awayCrest = match.awayTeam?.crest ?? null;

      const { data: existing } = await admin
        .from("matches")
        .select("id, team_a, team_b")
        .eq("external_id", externalId)
        .maybeSingle();

      if (!existing) {
        // Partido nuevo: insertar
        const { error: insertErr } = await admin.from("matches").insert({
          external_id: externalId,
          stage: match.competition?.name ?? competition,
          group_name: match.group ?? match.stage ?? null,
          team_a: homeName,
          team_b: awayName,
          team_a_flag: homeCrest,
          team_b_flag: awayCrest,
          kickoff_at: match.utcDate,
          status: mapStatus(match.status),
          score_a: match.score?.fullTime?.home ?? null,
          score_b: match.score?.fullTime?.away ?? null,
          test_mode: false,
        });

        if (insertErr) {
          results.push({ externalId, home: homeName, away: awayName, kickoff: match.utcDate, status: "error", reason: insertErr.message });
        } else {
          results.push({ externalId, home: homeName, away: awayName, kickoff: match.utcDate, status: "imported" });
        }
        continue;
      }

      // Partido existente: actualizar solo si algún equipo era "Por definir" y ahora ya se conoce
      const shouldUpdateA = isTbd(existing.team_a) && !isTbd(homeName);
      const shouldUpdateB = isTbd(existing.team_b) && !isTbd(awayName);

      if (!shouldUpdateA && !shouldUpdateB) {
        results.push({ externalId, home: homeName, away: awayName, kickoff: match.utcDate, status: "skipped", reason: "Ya existe y los equipos ya están definidos" });
        continue;
      }

      const patch: Record<string, string | null> = {};
      if (shouldUpdateA) { patch.team_a = homeName; patch.team_a_flag = homeCrest; }
      if (shouldUpdateB) { patch.team_b = awayName; patch.team_b_flag = awayCrest; }

      const { error: updateErr } = await admin.from("matches").update(patch).eq("id", existing.id);

      if (updateErr) {
        results.push({ externalId, home: homeName, away: awayName, kickoff: match.utcDate, status: "error", reason: updateErr.message });
      } else {
        const updatedFields = [shouldUpdateA ? homeName : null, shouldUpdateB ? awayName : null].filter(Boolean).join(" / ");
        results.push({ externalId, home: homeName, away: awayName, kickoff: match.utcDate, status: "updated", reason: `Equipos actualizados: ${updatedFields}` });
      }
    }

    const imported = results.filter((r) => r.status === "imported").length;
    const updated = results.filter((r) => r.status === "updated").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return new Response(JSON.stringify({ imported, updated, skipped, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
