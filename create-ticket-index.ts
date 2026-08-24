// TradeKopier — Crea un ticket de soporte desde el chat de la web
// Este código va dentro de una Supabase Edge Function llamada "create-ticket".
// Recuerda: "Enforce JWT Verification" debe estar DESACTIVADO (misma razón que en
// el webhook de Stripe y en support-chat — el navegador la llama directamente).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function enviarEmail(to: string, subject: string, html: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TradeKopier <licencias@tradekopier.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const bodyText = await resp.text();
    console.error(`Resend falló (status ${resp.status}) al enviar a ${to}: ${bodyText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message, conversation } = await req.json();

    if (!email || !message) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        name: name || null,
        email,
        message,
        conversation: conversation ?? null,
        source: "chat",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creando ticket:", error);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mensajeHtml = String(message).replace(/\n/g, "<br>");

    // Aviso al equipo (a ti) — para que veas el ticket sin tener que entrar al panel.
    // Va a tu Gmail personal porque licencias@tradekopier.com puede ENVIAR (vía Resend)
    // pero no tiene buzón propio donde recibir — solo compraste el dominio, sin hosting
    // de correo. Cambia esta dirección cuando tengas un buzón real en licencias@.
    await enviarEmail(
      "carlosets14@gmail.com",
      `Nuevo ticket de soporte — ${email}`,
      `<div style="font-family:sans-serif;max-width:480px;">
        <p><strong>${name ? name + " — " : ""}${email}</strong></p>
        <p>${mensajeHtml}</p>
        <p style="color:#888;font-size:12px;">ID: ${data.id}</p>
      </div>`,
    );

    // Confirmación automática al cliente.
    await enviarEmail(
      email,
      "Hemos recibido tu ticket — TradeKopier",
      `<div style="font-family:sans-serif;max-width:480px;">
        <p>Gracias por escribirnos. Hemos recibido tu mensaje y te responderemos por email lo
        antes posible (soporte 24/7).</p>
        <p style="background:#f4f4f4;padding:12px;border-radius:8px;"><em>${mensajeHtml}</em></p>
      </div>`,
    );

    return new Response(JSON.stringify({ ok: true, ticketId: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-ticket error:", err);
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
