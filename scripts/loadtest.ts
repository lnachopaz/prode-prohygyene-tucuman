/**
 * Load test script — simula N usuarios concurrentes consumiendo el Prode.
 *
 * Uso:
 *   bun run scripts/loadtest.ts
 *
 * Variables de entorno opcionales:
 *   CONCURRENCY  cantidad de usuarios a loguear (default 100, max 100)
 *   DURATION_SEC duración total en segundos (default 60)
 *   POLL_MS      intervalo entre queries por usuario (default 5000)
 *   SUPABASE_URL / SUPABASE_ANON_KEY (si no están, usa los del proyecto)
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://cngsozkoikrjaozxjbtz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NvemtvaWtyamFvenhqYnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjQ1OTksImV4cCI6MjA5MzA0MDU5OX0.71US49JsH16CIX1wtVAhCukn3D51GeOv9__eBfaJLKo";

const CONCURRENCY = Math.min(Number(process.env.CONCURRENCY ?? 100), 100);
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 60);
const POLL_MS = Number(process.env.POLL_MS ?? 5000);
const PASSWORD = "LoadTest123!";

type Stats = { ok: number; err: number; latencies: number[] };
const stats: Stats = { ok: 0, err: 0, latencies: [] };

async function runUser(idx: number, stopAt: number) {
  const email = `loadtest+${idx}@prode.test`;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: loginErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (loginErr) {
    console.error(`[user ${idx}] login error:`, loginErr.message);
    stats.err++;
    return;
  }

  // Suscripción realtime sobre matches (simula la pestaña Live abierta).
  const channel = client
    .channel(`matches-user-${idx}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches" },
      () => {},
    )
    .subscribe();

  while (Date.now() < stopAt) {
    const t0 = Date.now();
    try {
      await Promise.all([
        client.from("matches").select("*").order("kickoff_at"),
        client.from("predictions").select("*").limit(200),
        client.from("leaderboard").select("*").limit(50),
      ]);
      stats.ok++;
      stats.latencies.push(Date.now() - t0);
    } catch (e) {
      stats.err++;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await client.removeChannel(channel);
  await client.auth.signOut();
}

function summarise() {
  const lat = stats.latencies.sort((a, b) => a - b);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const p95 = lat.length ? lat[Math.floor(lat.length * 0.95)] : 0;
  const p99 = lat.length ? lat[Math.floor(lat.length * 0.99)] : 0;
  console.log("\n========== RESULTADOS ==========");
  console.log(`Usuarios concurrentes : ${CONCURRENCY}`);
  console.log(`Duración              : ${DURATION_SEC}s`);
  console.log(`Polling por usuario   : ${POLL_MS}ms`);
  console.log(`Queries OK            : ${stats.ok}`);
  console.log(`Queries con error     : ${stats.err}`);
  console.log(`Latencia media        : ${avg.toFixed(0)} ms`);
  console.log(`Latencia p95          : ${p95} ms`);
  console.log(`Latencia p99          : ${p99} ms`);
  console.log("================================\n");
}

async function main() {
  console.log(
    `🚀 Lanzando ${CONCURRENCY} usuarios por ${DURATION_SEC}s (poll ${POLL_MS}ms)`,
  );
  const stopAt = Date.now() + DURATION_SEC * 1000;
  const tasks: Promise<void>[] = [];
  // Login en batches para evitar rate-limit de auth (max ~30 logins/seg)
  const BATCH = 10;
  const BATCH_DELAY_MS = 4000;
  for (let i = 1; i <= CONCURRENCY; i++) {
    tasks.push(runUser(i, stopAt));
    if (i % BATCH === 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  await Promise.all(tasks);
  summarise();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
