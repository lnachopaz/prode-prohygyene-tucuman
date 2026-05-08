// Trae el resultado FINAL (90 minutos reglamentarios) de partidos cuyo
// kickoff fue hace ≥ 100 minutos y todavía no están marcados como `finished`
// en nuestra base. Llama a Football-Data v4 UNA vez por partido relevante,
// extrae estrictamente `score.fullTime` (ignora extra time / penales) y marca
// el partido como `finished`. El trigger de la DB recalcula los puntos.
//
// Si el partido ya estaba `finished` o `test_mode`, NO se toca: respetamos
// cualquier corrección manual del admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");

  const { data: logRow } = await admin
    .from("sync_logs")
    .insert({ function_name: "finalize-finished-matches", status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;
  const finishLog = (patch: Record<string, unknown>) =>
    logId
      ? admin.from("sync_logs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", logId)
      : Promise.resolve();

  if (!apiKey) {
    await finishLog({ status: "error", error_message: "FOOTBALL_DATA_API_KEY no configurada" });
    return new Response(JSON.stringify({ error: "no api key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Partidos candidatos: kickoff hace ≥ 100min, status ≠ finished, sin test_mode, con external_id
    const cutoffIso = new Date(Date.now() - 100 * 60 * 1000).toISOString();
    const { data: candidates } = await admin
      .from("matches")
      .select("id, external_id, status")
      .neq("status", "finished")
      .eq("test_mode", false)
      .lte("kickoff_at", cutoffIso)
      .not("external_id", "is", null)
      .limit(20);

    const matches = candidates ?? [];
    if (matches.length === 0) {
      await finishLog({ status: "success", updated_count: 0, details: { message: "no matches to finalize" } });
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; ok: boolean; status?: string; score?: string; error?: string }> = [];
    const DELAY_MS = matches.length > 1 ? 6500 : 0; // free tier 10 req/min

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const fdId = (m.external_id ?? "").replace(/^fd-/, "");
      try {
        const r = await fetch(`${FD_BASE}/matches/${fdId}`, { headers: { "X-Auth-Token": apiKey } });
        if (!r.ok) {
          const txt = await r.text();
          results.push({ id: m.id, ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 100)}` });
        } else {
          const data = await r.json();
          const upstreamStatus = (data.status ?? "").toUpperCase();
          // Solo procesamos partidos cuyo proveedor reporta como FINISHED/AWARDED
          if (!["FINISHED", "AWARDED"].includes(upstreamStatus)) {
            results.push({ id: m.id, ok: true, status: upstreamStatus, score: "skip-not-finished" });
          } else {
            // Football-Data v4: `fullTime` = resultado al 90'. `regularTime` solo es válido
            // cuando `duration` es EXTRA_TIME o PENALTY_SHOOTOUT (sino aparece como 0-0 basura).
            const duration = (data.score?.duration ?? "REGULAR").toUpperCase();
            const ft = data.score?.fullTime;
            const reg = data.score?.regularTime;
            const useReg = duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT";
            const score_a = (useReg ? reg?.home : ft?.home) ?? ft?.home ?? null;
            const score_b = (useReg ? reg?.away : ft?.away) ?? ft?.away ?? null;

            const { error: upErr } = await admin
              .from("matches")
              .update({
                status: "finished",
                score_a,
                score_b,
                updated_at: new Date().toISOString(),
              })
              .eq("id", m.id)
              .neq("status", "finished") // no pisar manuales
              .eq("test_mode", false);
            if (upErr) throw upErr;
            results.push({ id: m.id, ok: true, status: "finished", score: `${score_a ?? 0}-${score_b ?? 0}` });
          }
        }
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      if (i < matches.length - 1 && DELAY_MS > 0) {
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }

    const okCount = results.filter((r) => r.ok && r.status === "finished").length;
    const errCount = results.filter((r) => !r.ok).length;
    await finishLog({
      status: errCount === 0 ? "success" : okCount === 0 ? "error" : "partial",
      updated_count: okCount,
      details: { results },
      error_message: errCount > 0 ? `${errCount} fallidos` : null,
    });

    return new Response(JSON.stringify({ updated: okCount, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishLog({ status: "error", error_message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
