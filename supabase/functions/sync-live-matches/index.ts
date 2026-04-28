// Sincroniza partidos con Football-Data.org
// Busca todos los partidos en la DB con external_id que empiece con "fd-"
// y actualiza score_a, score_b, status desde la API.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
    if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Buscar partidos con external_id estilo "fd-<id>"
    // Reintenta ante errores transitorios de PostgREST (PGRST000/PGRST002)
    let matches: Array<{ id: string; external_id: string | null; status: string }> | null = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await admin
        .from("matches")
        .select("id, external_id, status")
        .like("external_id", "fd-%");
      if (!error) { matches = data; lastErr = null; break; }
      lastErr = error;
      if (error.code !== "PGRST000" && error.code !== "PGRST002") break;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
    if (lastErr) throw lastErr;
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No hay partidos vinculados a Football-Data." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; ok: boolean; status?: string; score?: string; error?: string }> = [];

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

        results.push({ id: m.id, ok: true, status: newStatus, score: `${score_a ?? 0}-${score_b ?? 0}` });
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ updated: results.filter((r) => r.ok).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-live-matches error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
