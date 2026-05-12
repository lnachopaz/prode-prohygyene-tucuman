import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    const APP_URL = Deno.env.get("APP_URL") ?? "https://prode.prohygiene.com";

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error("Missing GMAIL_USER or GMAIL_APP_PASSWORD");
      return new Response(JSON.stringify({ error: "missing_smtp_secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, display_name, email } = await req.json();
    if (!email || !display_name) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUrl = `${APP_URL}/admin`;
    const html = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#0b2a5b;padding:24px;text-align:center;color:#ffffff;">
          <h1 style="margin:0;font-size:20px;">Nuevo usuario esperando aprobación</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#1a2540;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">El usuario <strong>${display_name}</strong> (<a href="mailto:${email}" style="color:#0b2a5b;">${email}</a>) se registró en el Prode PH 2026 y está esperando tu aprobación.</p>
          <p style="margin:0 0 12px;color:#5a6a85;font-size:13px;">User ID: ${user_id ?? "-"}</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${adminUrl}" style="background:#3aa0ff;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">Ir al panel de admin</a>
          </p>
          <p style="margin:0;color:#5a6a85;font-size:13px;">O abrí: <a href="${adminUrl}" style="color:#0b2a5b;">${adminUrl}</a></p>
        </td></tr>
        <tr><td style="background:#0b2a5b;padding:14px;text-align:center;color:#9bb3d9;font-size:12px;">
          Prode PH 2026
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    await client.send({
      from: "prodefutbolpag@gmail.com",
      to: "prodefutbolpag@gmail.com",
      subject: `Nuevo usuario solicitando acceso al Prode: ${display_name}`,
      html,
      content: `${display_name} (${email}) está esperando aprobación. ${adminUrl}`,
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-admin-new-user error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
