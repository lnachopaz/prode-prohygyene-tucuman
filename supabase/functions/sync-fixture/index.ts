// Sincroniza el fixture completo del Mundial 2026 desde Football-Data.org
// Reemplaza/upserta partidos por external_id "fd-<id>" y mapea nombres a español.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapa de nombres EN → ES (Football-Data usa nombres en inglés)
const TEAM_ES: Record<string, string> = {
  "Mexico": "México",
  "South Africa": "Sudáfrica",
  "South Korea": "República de Corea",
  "Korea Republic": "República de Corea",
  "Czechia": "Chequia",
  "Canada": "Canadá",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  "United States": "EE. UU.",
  "USA": "EE. UU.",
  "Paraguay": "Paraguay",
  "Qatar": "Catar",
  "Switzerland": "Suiza",
  "Brazil": "Brasil",
  "Morocco": "Marruecos",
  "Haiti": "Haití",
  "Scotland": "Escocia",
  "Australia": "Australia",
  "Turkey": "Turquía",
  "Türkiye": "Turquía",
  "Germany": "Alemania",
  "Curacao": "Curazao",
  "Curaçao": "Curazao",
  "Netherlands": "Países Bajos",
  "Japan": "Japón",
  "Ivory Coast": "Costa de Marfil",
  "Côte d'Ivoire": "Costa de Marfil",
  "Ecuador": "Ecuador",
  "Sweden": "Suecia",
  "Tunisia": "Túnez",
  "Spain": "España",
  "Cape Verde": "Islas de Cabo Verde",
  "Cabo Verde": "Islas de Cabo Verde",
  "Belgium": "Bélgica",
  "Egypt": "Egipto",
  "Saudi Arabia": "Arabia Saudí",
  "Uruguay": "Uruguay",
  "Iran": "RI de Irán",
  "IR Iran": "RI de Irán",
  "New Zealand": "Nueva Zelanda",
  "France": "Francia",
  "Senegal": "Senegal",
  "Iraq": "Irak",
  "Norway": "Noruega",
  "Argentina": "Argentina",
  "Algeria": "Argelia",
  "England": "Inglaterra",
  "Jordan": "Jordania",
  "Colombia": "Colombia",
  "Uzbekistan": "Uzbekistán",
  "Croatia": "Croacia",
  "Ghana": "Ghana",
  "Portugal": "Portugal",
  "Austria": "Austria",
  "Italy": "Italia",
  "Panama": "Panamá",
  "Jamaica": "Jamaica",
  "Nigeria": "Nigeria",
  "Denmark": "Dinamarca",
  "Poland": "Polonia",
  "DR Congo": "RD del Congo",
  "Venezuela": "Venezuela",
  "Bolivia": "Bolivia",
  "Iceland": "Islandia",
  "Wales": "Gales",
  "Northern Ireland": "Irlanda del Norte",
  "Republic of Ireland": "Irlanda",
  "Ireland": "Irlanda",
  "Slovakia": "Eslovaquia",
  "Czech Republic": "Chequia",
  "Greece": "Grecia",
  "Albania": "Albania",
  "Romania": "Rumania",
  "Hungary": "Hungría",
  "Ukraine": "Ucrania",
  "Russia": "Rusia",
};

// Códigos ISO para flagcdn (cuando no usamos crest de la API)
const TEAM_FLAG: Record<string, string> = {
  "México": "mx", "Sudáfrica": "za", "República de Corea": "kr", "Chequia": "cz",
  "Canadá": "ca", "Bosnia y Herzegovina": "ba", "EE. UU.": "us", "Paraguay": "py",
  "Catar": "qa", "Suiza": "ch", "Brasil": "br", "Marruecos": "ma", "Haití": "ht",
  "Escocia": "gb-sct", "Australia": "au", "Turquía": "tr", "Alemania": "de",
  "Curazao": "cw", "Países Bajos": "nl", "Japón": "jp", "Costa de Marfil": "ci",
  "Ecuador": "ec", "Suecia": "se", "Túnez": "tn", "España": "es",
  "Islas de Cabo Verde": "cv", "Bélgica": "be", "Egipto": "eg", "Arabia Saudí": "sa",
  "Uruguay": "uy", "RI de Irán": "ir", "Nueva Zelanda": "nz", "Francia": "fr",
  "Senegal": "sn", "Irak": "iq", "Noruega": "no", "Argentina": "ar", "Argelia": "dz",
  "Inglaterra": "gb-eng", "Jordania": "jo", "Colombia": "co", "Uzbekistán": "uz",
  "Croacia": "hr", "Ghana": "gh", "Portugal": "pt", "Austria": "at", "Italia": "it",
  "Panamá": "pa", "Jamaica": "jm", "Nigeria": "ng", "Dinamarca": "dk", "Polonia": "pl",
  "RD del Congo": "cd", "Venezuela": "ve", "Bolivia": "bo", "Islandia": "is",
  "Gales": "gb-wls", "Irlanda del Norte": "gb-nir", "Irlanda": "ie",
  "Eslovaquia": "sk", "Grecia": "gr", "Albania": "al", "Rumania": "ro",
  "Hungría": "hu", "Ucrania": "ua", "Rusia": "ru",
};

function toEs(name: string): string {
  return TEAM_ES[name] ?? name;
}
function flagFor(esName: string, fallback: string | null): string | null {
  const code = TEAM_FLAG[esName];
  if (code) return `https://flagcdn.com/w80/${code}.png`;
  return fallback;
}

function mapStatus(s: string): "scheduled" | "live" | "finished" {
  switch (s) {
    case "IN_PLAY": case "PAUSED": case "LIVE": return "live";
    case "FINISHED": case "AWARDED": return "finished";
    default: return "scheduled";
  }
}

function stageLabel(stage: string, group: string | null, matchday: number | null): string {
  switch (stage) {
    case "GROUP_STAGE":
      return `Fase de grupos${matchday ? ` · Jornada ${matchday}` : ""}`;
    case "LAST_16": return "Octavos de final";
    case "QUARTER_FINALS": return "Cuartos de final";
    case "SEMI_FINALS": return "Semifinales";
    case "THIRD_PLACE": return "Tercer puesto";
    case "FINAL": return "Final";
    default: return stage.replaceAll("_", " ");
  }
}

function groupLabel(group: string | null): string | null {
  if (!group) return null;
  // GROUP_A → Grupo A
  return group.replace("GROUP_", "Grupo ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
    if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Traer todos los partidos del Mundial
    const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) throw new Error(`Football-Data ${r.status}: ${await r.text()}`);
    const json = await r.json();
    const matches = (json.matches ?? []) as any[];
    if (matches.length === 0) throw new Error("La API no devolvió partidos");

    // 2) Borrar partidos viejos del mundial (wc2026-* y fd-* salvo el de prueba PSG/Bayern)
    await admin.from("matches").delete().like("external_id", "wc2026-%");

    // 3) Upsert cada partido
    const rows = matches.map((m) => {
      const teamA = toEs(m.homeTeam?.name ?? "TBD");
      const teamB = toEs(m.awayTeam?.name ?? "TBD");
      return {
        external_id: `fd-${m.id}`,
        stage: stageLabel(m.stage, m.group, m.matchday),
        group_name: groupLabel(m.group),
        team_a: teamA,
        team_b: teamB,
        team_a_flag: flagFor(teamA, m.homeTeam?.crest ?? null),
        team_b_flag: flagFor(teamB, m.awayTeam?.crest ?? null),
        kickoff_at: m.utcDate,
        status: mapStatus(m.status),
        score_a: m.score?.fullTime?.home ?? null,
        score_b: m.score?.fullTime?.away ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    // upsert por external_id
    const { error: upErr, count } = await admin
      .from("matches")
      .upsert(rows, { onConflict: "external_id", count: "exact" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({
      ok: true,
      total: rows.length,
      upserted: count,
      first: rows[0]?.kickoff_at,
      last: rows[rows.length - 1]?.kickoff_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = e?.message || (typeof e === "string" ? e : JSON.stringify(e));
    console.error("sync-fixture error:", msg, e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
