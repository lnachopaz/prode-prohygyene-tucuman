/**
 * Burst test — simula el momento crítico antes de un partido:
 * N usuarios cargan/editan su pronóstico al mismo tiempo.
 *
 * Uso:
 *   bun run scripts/burst-predictions.ts
 *
 * Variables:
 *   USERS=50         cantidad de usuarios concurrentes (max 100)
 *   MATCHES_PER=3    pronósticos por usuario en el burst
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://cngsozkoikrjaozxjbtz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NvemtvaWtyamFvenhqYnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjQ1OTksImV4cCI6MjA5MzA0MDU5OX0.71US49JsH16CIX1wtVAhCukn3D51GeOv9__eBfaJLKo";

const USERS = Math.min(Number(process.env.USERS ?? 50), 100);
const MATCHES_PER = Number(process.env.MATCHES_PER ?? 3);
const PASSWORD = "LoadTest123!";

type Stats = { ok: number; err: number; latencies: number[]; errors: string[] };
const stats: Stats = { ok: 0, err: 0, latencies: [], errors: [] };

async function loadOpenMatches(): Promise<string[]> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const nowPlus1h = new Date(Date.now() + 60 * 60 * 1000 + 5000).toISOString();
  const { data } = await c
    .from("matches")
    .select("id, kickoff_at")
    .gt("kickoff_at", nowPlus1h)
    .order("kickoff_at")
    .limit(MATCHES_PER);
  return (data ?? []).map((m: any) => m.id);
}

async function loginBatch(n: number) {
  const clients: any[] = [];
  for (let i = 1; i <= n; i++) {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: `loadtest+${i}@prode.test`,
      password: PASSWORD,
    });
    if (error) {
      console.error(`[user ${i}] login error: ${error.message}`);
      continue;
    }
    clients.push({ idx: i, client: c });
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 4000));
  }
  return clients;
}

async function burstUser(idx: number, client: any, matchIds: string[], userId: string) {
  for (const matchId of matchIds) {
    const t0 = Date.now();
    try {
      const { error } = await client
        .from("predictions")
        .upsert(
          {
            user_id: userId,
            match_id: matchId,
            pred_a: Math.floor(Math.random() * 4),
            pred_b: Math.floor(Math.random() * 4),
          },
          { onConflict: "user_id,match_id" },
        );
      if (error) {
        stats.err++;
        if (stats.errors.length < 5) stats.errors.push(`[user ${idx}] ${error.message}`);
      } else {
        stats.ok++;
        stats.latencies.push(Date.now() - t0);
      }
    } catch (e: any) {
      stats.err++;
      if (stats.errors.length < 5) stats.errors.push(`[user ${idx}] ${e.message}`);
    }
  }
}

async function main() {
  console.log(`🔥 BURST: ${USERS} usuarios x ${MATCHES_PER} pronósticos simultáneos`);

  const matchIds = await loadOpenMatches();
  if (matchIds.length === 0) {
    console.error("No hay partidos abiertos a más de 1h. Abortando.");
    process.exit(1);
  }
  console.log(`Partidos seleccionados: ${matchIds.length}`);

  console.log(`Logueando ${USERS} usuarios (en batches de 10)...`);
  const clients = await loginBatch(USERS);
  console.log(`✅ Logueados: ${clients.length}\n`);

  console.log(`💥 Disparando ${clients.length * MATCHES_PER} upserts SIMULTÁNEOS...`);
  const burstStart = Date.now();
  await Promise.all(
    clients.map(({ idx, client }) =>
      burstUser(idx, client, matchIds, client.auth.getSession ? null as any : null).catch(() => {}),
    ),
  );

  // Re-disparar con userId real
  await Promise.all(
    clients.map(async ({ idx, client }) => {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) await burstUser(idx, client, matchIds, uid);
    }),
  );

  const burstDur = Date.now() - burstStart;

  const lat = stats.latencies.sort((a, b) => a - b);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const p95 = lat.length ? lat[Math.floor(lat.length * 0.95)] : 0;
  const p99 = lat.length ? lat[Math.floor(lat.length * 0.99)] : 0;
  const max = lat.length ? lat[lat.length - 1] : 0;

  console.log("\n========== RESULTADO BURST ==========");
  console.log(`Usuarios efectivos    : ${clients.length}`);
  console.log(`Upserts OK            : ${stats.ok}`);
  console.log(`Upserts con error     : ${stats.err}`);
  console.log(`Duración total burst  : ${burstDur} ms`);
  console.log(`Throughput            : ${(stats.ok / (burstDur / 1000)).toFixed(1)} upserts/seg`);
  console.log(`Latencia media        : ${avg.toFixed(0)} ms`);
  console.log(`Latencia p95          : ${p95} ms`);
  console.log(`Latencia p99          : ${p99} ms`);
  console.log(`Latencia max          : ${max} ms`);
  if (stats.errors.length) {
    console.log(`\nMuestras de error:`);
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("=====================================\n");

  await Promise.all(clients.map(({ client }) => client.auth.signOut()));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
