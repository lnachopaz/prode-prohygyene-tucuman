// Envía un email de bienvenida al usuario recién aprobado por el admin.
// Body esperado: { user_id: string }
// Requiere secrets: RESEND_API_KEY, RESEND_FROM (opcional), APP_URL (opcional)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY no configurada" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const from = Deno.env.get("RESEND_FROM") ?? "Prode PH 2026 <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://prode.prohygiene.com";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener email y nombre del usuario
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user_id);
    if (authErr || !authUser?.user) throw new Error(authErr?.message ?? "Usuario no encontrado");

    const email = authUser.user.email!;
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user_id)
      .single();
    const name = profile?.display_name ?? email.split("@")[0];

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a6e 0%,#2563a8 100%);padding:36px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:bold;color:#ffffff;letter-spacing:1px;">PRODE PH</p>
            <p style="margin:6px 0 0;font-size:13px;color:#a8c4e8;letter-spacing:2px;text-transform:uppercase;">Mundial 2026 · Prohygiene Tucumán</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 12px;font-size:22px;font-weight:bold;color:#1e3a6e;">¡Ya estás adentro, ${name}!</p>
            <p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.6;">
              Tu cuenta fue <strong>aprobada</strong> por el administrador del Prode Prohygiene 2026.
              Ya podés ingresar y cargar tus pronósticos para el Mundial.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td style="background:#2563a8;border-radius:8px;">
                  <a href="${appUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">
                    Ingresar al Prode →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#718096;">
              Si el botón no funciona, copiá este enlace en tu navegador:
            </p>
            <p style="margin:0 0 24px;font-size:12px;color:#2563a8;word-break:break-all;">${appUrl}</p>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.5;">
              Recordá que los pronósticos cierran <strong>1 hora antes de cada partido</strong>.<br>
              ¡Buena suerte y vamos Argentina!
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#a0aec0;">Prode Prohygiene Tucumán · Mundial 2026</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "¡Tu cuenta fue aprobada! Ingresá al Prode PH 2026",
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
