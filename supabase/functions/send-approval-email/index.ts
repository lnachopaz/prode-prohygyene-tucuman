import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(user_id);
    if (userErr || !userRes?.user?.email) {
      console.error("user lookup failed", userErr);
      return new Response(JSON.stringify({ error: "user_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = userRes.user.email;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user_id)
      .maybeSingle();
    const name = profile?.display_name ?? "jugador";

    const html = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#0b2a5b;padding:24px;text-align:center;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">¡Tu cuenta fue aprobada! 🎉</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#1a2540;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">Hola <strong>${name}</strong>,</p>
          <p style="margin:0 0 12px;">Un administrador aprobó tu cuenta en el <strong>Prode PH 2026</strong>. Ya podés ingresar y empezar a cargar tus pronósticos.</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${APP_URL}" style="background:#3aa0ff;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">Ingresar al Prode</a>
          </p>
          <p style="margin:0 0 8px;color:#5a6a85;font-size:13px;">O abrí este link: <a href="${APP_URL}" style="color:#0b2a5b;">${APP_URL}</a></p>
        </td></tr>
        <tr><td style="background:#0b2a5b;padding:14px;text-align:center;color:#9bb3d9;font-size:12px;">
          Prode PH 2026 · ¡Mucha suerte!
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
      to: email,
      subject: "¡Tu cuenta fue aprobada! Ingresá al Prode PH 2026",
      html,
      content: `Tu cuenta fue aprobada. Ingresá: ${APP_URL}`,
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-approval-email error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
