// TradeKopier — Chat de soporte con IA (Claude Haiku)
// Este código va dentro de una Supabase Edge Function llamada "support-chat".
// Recuerda: "Enforce JWT Verification" debe estar DESACTIVADO (misma razón que en
// el webhook de Stripe — el navegador la llama directamente, sin JWT de Supabase).

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres el asistente de soporte de TradeKopier, un AddOn (complemento) para NinjaTrader 8
que copia operaciones de una cuenta maestra hacia cuentas esclavas ilimitadas, con conexiones
ilimitadas (compatible con TradingView, Tradovate, Rithmic, y cualquier bróker o empresa de
fondeo conectada a NinjaTrader 8: Lucid Trading, Apex Trader Funding, Tradeify, Bulenox, Alpha
Futures, MyFundedFutures, y muchas más).

Datos clave que puedes usar para responder:
- Planes (todos incluyen las mismas funciones, solo cambia la duración y el precio):
  Mensual $25, Trimestral $60 (ahorras $15), Semestral $100 (ahorras $50).
- Funciones incluidas en todos los planes: cuentas y conexiones ilimitadas, réplica en tiempo
  real, gestión de riesgo PDLL/PDPT automática (liquidación y bloqueo configurable por cuenta),
  protección SL/TP real, Cockpit en vivo (PnL, posiciones, flatten de emergencia), soporte 24/7.
- Instalación: NinjaTrader 8 → Tools → Import → NinjaScript Add-On → seleccionar el archivo →
  reiniciar NinjaTrader → activar con el email y la clave de licencia (llega por email al
  instante tras completar el pago, de forma automática).
- La licencia es personal, vinculada al email con el que se compró. No se puede compartir ni
  revender.
- TradeKopier no guarda contraseñas de bróker — la conexión vive por completo dentro de
  NinjaTrader, en el equipo del usuario.
- Contacto humano: licencias@tradekopier.com.

Cómo responder:
- Responde SIEMPRE en el mismo idioma en el que te escriba el usuario.
- Sé breve, claro y amable — nada de respuestas largas tipo ensayo.
- Nunca des consejos de inversión ni garantices resultados de trading.
- Si la pregunta requiere mirar datos concretos de la cuenta del usuario (estado de SU
  licencia, un reembolso, un fallo/bug específico, algo que no puedes saber sin acceso a la
  base de datos), NO inventes una respuesta. Dile con naturalidad que vas a pasar esto al
  equipo humano y sugiérele el botón de "abrir ticket" que tiene debajo del chat.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "missing_messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Límite de seguridad básico: recorta el historial y el tamaño de cada mensaje
    // para no dejar la puerta abierta a abuso que dispare el coste de la API.
    const trimmed = messages.slice(-12).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 1500),
    }));

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: trimmed,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Anthropic error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reply = data?.content?.[0]?.text ?? "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("support-chat error:", err);
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
