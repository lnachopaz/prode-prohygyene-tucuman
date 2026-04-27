// Sync World Cup 2026 matches from TheSportsDB
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TheSportsDB free key '3' + FIFA World Cup league id 4429
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const WORLD_CUP_LEAGUE_ID = "4429";
const SEASON = "2026";

interface TsdbEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string;
  strTime: string;
  strTimestamp: string | null;
  strStatus: string | null;
  strGroup?: string | null;
  strRound?: string | null;
}

function mapStatus(s: string | null, hasScore: boolean): "scheduled" | "live" | "finished" {
  if (!s) return hasScore ? "finished" : "scheduled";
  const v = s.toLowerCase();
  if (v.includes("ft") || v.includes("finish") || v.includes("aet") || v.includes("pen")) return "finished";
  if (v.includes("ht") || v.includes("live") || /^\d/.test(v)) return "live";
  return hasScore ? "finished" : "scheduled";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = `${TSDB_BASE}/eventsseason.php?id=${WORLD_CUP_LEAGUE_ID}&s=${SEASON}`;
    const res = await fetch(url);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `TheSportsDB ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const events: TsdbEvent[] = data?.events ?? [];

    if (!events.length) {
      return new Response(
        JSON.stringify({ inserted: 0, updated: 0, message: "No fixtures available yet for World Cup 2026 in TheSportsDB." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = events.map((e) => {
      const kickoff = e.strTimestamp
        ? new Date(e.strTimestamp).toISOString()
        : new Date(`${e.dateEvent}T${e.strTime || "00:00:00"}Z`).toISOString();
      const sa = e.intHomeScore == null ? null : Number(e.intHomeScore);
      const sb = e.intAwayScore == null ? null : Number(e.intAwayScore);
      return {
        external_id: e.idEvent,
        stage: e.strRound || "Group Stage",
        group_name: e.strGroup ?? null,
        team_a: e.strHomeTeam,
        team_b: e.strAwayTeam,
        team_a_flag: e.strHomeTeamBadge ?? null,
        team_b_flag: e.strAwayTeamBadge ?? null,
        kickoff_at: kickoff,
        score_a: sa,
        score_b: sb,
        status: mapStatus(e.strStatus, sa != null && sb != null),
      };
    });

    const { error } = await supabase
      .from("matches")
      .upsert(rows, { onConflict: "external_id" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ count: rows.length, message: `Synced ${rows.length} matches.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-matches error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
