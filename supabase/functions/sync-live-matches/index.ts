// FINALIZE-ONLY sync con Football-Data.org.
//
// Política nueva (sin webhooks ni tick por minuto):
//   - Solo busca partidos cuyo kickoff_at ya pasó hace al menos 100 min y como mucho 6h,
//     y que NO estén `finished` aún.
//   - Hace 1 (o 2 si la primera no muestra "FINISHED") consultas por partido.
//   - Cuando el upstream dice FINISHED, guarda ESTRICTAMENTE el resultado de los
//     90 minutos reglamentarios (regularTime). Ignora alargue y penales.
//   - Marca status='finished'. El trigger `recalc_predictions_for_match` aplica los puntos.
//   - Excluye partidos en test_mode (los maneja el admin manualmente).
//
// Este edge function se llama desde un cron (cada ~15 min) o manualmente desde el panel
// admin (botón "Cerrar partidos finalizados ahora").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FD_BASE = "https://api.football-data.org/v4";

/**
 * Extrae el resultado de los 90 minutos reglamentarios.
 * Reglas (ordenadas):
 *   1. Si viene `score.regularTime.{home,away}`, usar eso (los 90' netos).
 *   2. Si NO viene regularTime y la duración es REGULAR (no hubo alargue),
 *      usar `score.fullTime` (es lo mismo).
 *   3. Si hubo alargue/penales y regularTime no existe → null (no podemos
 *      diferenciar; mejor reintentar después que guardar mal).
 */
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
    // Ventana: kickoff entre hace 6h y hace 100 min (ya pasaron 90' + descuento + posible alargue).
    const windowEnd = new Date(now.getTime() - 100 * 60 * 1000).toISOString();
    const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await admin
      .from("matches")
      .select("id, team_a, team_b, external_id, status")
      .neq("status", "finished")
      .eq("test_mode", false)
      .gte("kickoff_at", windowStart)
      .lte("kickoff_at", windowEnd)
      .not("external_id", "is", null);

    const matches = candidates ?? [];

    if (matches.length === 0) {
      await finishLog({
        status: "success",
        updated_count: 0,
        details: { message: "no matches in finalize window", checked_at: now.toISOString() },
      });
      return new Response(
        JSON.stringify({ updated: 0, message: "No hay partidos pendientes de finalizar." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ id: string; ok: boolean; finalized?: boolean; score?: string; attempt?: number; error?: string }> = [];
    const DELAY_MS = 6500; // 10 req/min en plan free

    async function checkOne(m: any, attempt: number) {
      const fdId = (m.external_id ?? "").replace(/^fd-/, "");
      if (!fdId) return { ok: false, error: "external_id sin prefijo fd-" };
      const r = await fetch(`${FD_BASE}/matches/${fdId}`, { headers: { "X-Auth-Token": apiKey } });
      if (!r.ok) {
        const txt = await r.text();
        return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 120)}` };
      }
      const data = await r.json();
      const upstream = (data.status ?? "").toUpperCase();
      const isFinished = upstream === "FINISHED" || upstream === "AWARDED";

      if (!isFinished) {
        return { ok: true, finalized: false, attempt };
      }

      const { a, b } = extractRegular90(data.score);
      if (a == null || b == null) {
        return { ok: false, error: `FINISHED sin regularTime/fullTime válido` };
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
      return { ok: true, finalized: true, score: `${a}-${b}`, attempt };
    }

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      try {
        let res = await checkOne(m, 1);
        // Doble pase: si la primera vez upstream aún no dice FINISHED,
        // esperamos 8s y reintentamos UNA vez (sin contar contra el rate limit del próximo).
        if (res.ok && !(res as any).finalized) {
          await new Promise((r) => setTimeout(r, 8000));
          const second = await checkOne(m, 2);
          if (second.ok && (second as any).finalized) res = second;
        }
        results.push({ id: m.id, ...(res as any) });
      } catch (e) {
        results.push({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }

      if (i < matches.length - 1) {
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }

    const finalized = results.filter((r) => (r as any).finalized).length;
    const errCount = results.filter((r) => !r.ok).length;
    await finishLog({
      status: errCount === 0 ? "success" : finalized === 0 ? "error" : "partial",
      updated_count: finalized,
      details: { results, provider: "football-data", mode: "finalize-only" },
      error_message: errCount > 0 ? `${errCount} partidos no se pudieron consultar` : null,
    });

    return new Response(JSON.stringify({ updated: finalized, results }), {
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
