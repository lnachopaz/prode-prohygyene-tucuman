// Crea 10 cuentas bot (test001..test010) y carga 10 pronósticos distintos
// para un partido específico (por defecto: Bayern vs PSG UCL).
// Solo admins (verifica JWT + has_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MATCH_ID = "dae6d78e-7ff7-4281-a307-b8230e486bc4"; // Bayern vs PSG
const PASSWORD = "Prode2026!";

// 10 marcadores variados para un partido de UCL alto perfil
const PREDICTIONS: Array<[number, number]> = [
  [2, 1], // Bayern gana
  [3, 1],
  [2, 0],
  [1, 0],
  [3, 2],
  [1, 1], // empate
  [2, 2],
  [0, 0],
  [1, 2], // PSG gana
  [0, 1],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // --- Auth: solo admin ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const callerId = userRes.user?.id;
  if (!callerId) {
    return new Response(JSON.stringify({ error: "invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "not authorized" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let matchId = DEFAULT_MATCH_ID;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.match_id) matchId = String(body.match_id);
  } catch { /* noop */ }

  // Verificar que el partido existe
  const { data: matchRow, error: mErr } = await admin
    .from("matches").select("id, team_a, team_b").eq("id", matchId).maybeSingle();
  if (mErr || !matchRow) {
    return new Response(JSON.stringify({ error: "match not found", matchId }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const created: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < 10; i++) {
    const num = String(i + 1).padStart(3, "0");
    const email = `bot${num}@prode.test`;
    const displayName = `🤖 Bot ${num}`;
    let userId: string | null = null;

    // Intentar crear; si ya existe, buscar por email
    const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (createErr) {
      // Probablemente ya existe
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list.users.find((u) => u.email === email);
      if (found) userId = found.id;
      else { errors.push({ email, error: createErr.message }); continue; }
    } else {
      userId = createRes.user!.id;
    }

    // Asegurar profile aprobado (el trigger handle_new_user crea uno pending)
    await admin
      .from("profiles")
      .upsert({ id: userId, display_name: displayName, status: "approved" }, { onConflict: "id" });

    // Cargar pronóstico para el partido
    const [pa, pb] = PREDICTIONS[i];
    const { error: predErr } = await admin
      .from("predictions")
      .upsert(
        { user_id: userId, match_id: matchId, pred_a: pa, pred_b: pb },
        { onConflict: "user_id,match_id" },
      );
    if (predErr) {
      errors.push({ email, error: predErr.message });
      continue;
    }

    created.push({ email, displayName, prediction: `${pa}-${pb}` });
  }

  return new Response(
    JSON.stringify({ ok: true, match: matchRow, created, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
