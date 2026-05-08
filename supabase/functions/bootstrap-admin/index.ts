// One-shot: crea (o reusa) el admin Ignacio Paz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const EMAIL = "ignacio.paz@prohygiene.com";
  const PASSWORD = "Batuque1277";
  const DISPLAY = "Ignacio Paz";
  const INVITE_CODE = "IGNACIO-PAZ-2026";

  try {
    // 1. Asegurar invite code
    await admin
      .from("admin_invite_codes")
      .upsert({ code: INVITE_CODE, active: true }, { onConflict: "code" });

    // 2. Buscar si el usuario ya existe
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());

    let userId: string;
    if (existing) {
      userId = existing.id;
      // Asegurar password actualizado
      await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: DISPLAY, admin_code: INVITE_CODE },
      });
      if (error) throw error;
      userId = created.user!.id;
    }

    // 3. Asegurar profile approved + rol admin (idempotente)
    await admin
      .from("profiles")
      .upsert({ id: userId, display_name: DISPLAY, status: "approved" }, { onConflict: "id" });

    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    return new Response(JSON.stringify({ ok: true, user_id: userId, email: EMAIL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bootstrap-admin error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
