// TradeKopier — Webhook de Stripe: crea la licencia y manda el email al pagar
// Este código va dentro de una Supabase Edge Function.
//
// Los 3 planes son suscripciones (Mensual $25, Trimestral $60, Semestral $100),
// pero solo el Mensual tiene 7 días de prueba gratis. Se distinguen por el importe
// cobrado en el checkout (amount_total): 0 = prueba mensual, >0 = pago inmediato
// (Trimestral/Semestral, sin prueba).
//
//  - checkout.session.completed (session.mode === "subscription"):
//      · amount_total === 0  → Mensual con prueba: se crea la licencia con 7 días
//        de validez (plan="trial"). No se cobra nada todavía.
//      · amount_total > 0    → Trimestral o Semestral: se cobra ya, se crea la
//        licencia con los días del plan (90 o 180) y plan="paid" directamente.
//        Se guarda el ID de la factura (initial_invoice_id) para no volver a sumar
//        estos mismos días cuando llegue el invoice.paid de esta misma factura.
//  - invoice.paid: Stripe acaba de cobrar la tarjeta (fin de la prueba mensual,
//    o cualquier renovación — mensual/trimestral/semestral). Si la factura es la
//    misma que ya procesamos en el checkout (initial_invoice_id), se ignora para no
//    duplicar días. Si no, es una renovación real: se busca la licencia por el ID
//    de la suscripción y se le añaden los días correspondientes al importe cobrado
//    (30 / 90 / 180), y el plan pasa a "paid".
//
// Si el usuario cancela o deja de pagar, simplemente no se le añaden más días — la
// licencia expira sola cuando toque, sin que haya que hacer nada especial aquí.
//
// Se mantiene también el caso antiguo de pago único (session.mode === "payment"),
// por si en el futuro se usara para algo — no afecta a los 3 planes actuales.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

function randomBlock(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
}

// Mapea el importe cobrado (en céntimos) a los días de validez del plan.
// Se usa tanto para el pago único antiguo como para el primer cobro y las
// renovaciones de las suscripciones (Mensual $25 / Trimestral $60 / Semestral $100).
// Ajusta los umbrales si cambias los precios.
function diasPorImporte(amountCents: number): number {
  if (amountCents >= 9000) return 180; // Semestral $100
  if (amountCents >= 5000) return 90; // Trimestral $60
  return 30; // Mensual $25 (o cualquier importe menor)
}

async function enviarEmailLicencia(
  destino: string,
  clave: string,
  dias: number,
  esPrueba: boolean,
) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TradeKopier <licencias@tradekopier.com>",
      to: [destino],
      subject: esPrueba ? "Tu prueba gratuita de TradeKopier (7 días)" : "Tu licencia de TradeKopier",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2>${esPrueba ? "¡Tu prueba gratuita ya está lista! 🎁" : "¡Gracias por tu compra!"}</h2>
          <p>Aquí tienes tu clave de licencia de TradeKopier:</p>
          <p style="font-size:20px;font-family:monospace;background:#f4f4f4;padding:14px;border-radius:8px;text-align:center;letter-spacing:1px;">${clave}</p>
          <p>Es válida por <strong>${dias} días</strong> a partir del momento en que la actives por primera vez dentro de TradeKopier (no desde hoy).</p>
          ${
            esPrueba
              ? `<p>Pasados los 7 días, tu tarjeta se cargará automáticamente y tu licencia se
                 extenderá sola un mes más — no tienes que hacer nada. Puedes cancelar cuando
                 quieras desde el enlace de gestión de suscripción de tu email de confirmación de Stripe.</p>`
              : ""
          }
          <p><a href="https://tradekopier.com/downloads/TradeKopier.zip" style="display:inline-block;background:#3ea6ff;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">⬇ Descargar TradeKopier</a></p>
          <p>Para instalar: abre NinjaTrader 8 → Tools → Import → NinjaScript Add-On, selecciona el .zip que acabas de descargar, reinicia NinjaTrader, y al abrir TradeKopier introduce tu email y esta clave.</p>
          <p>Cualquier duda, respóndenos a este email.</p>
        </div>
      `,
    }),
  });

  if (!resp.ok) {
    console.error(`Resend falló (status ${resp.status}) al enviar a ${destino}: ${await resp.text()}`);
  }
}

async function enviarEmailRenovacion(destino: string, dias: number) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TradeKopier <licencias@tradekopier.com>",
      to: [destino],
      subject: "Tu suscripción de TradeKopier se ha renovado",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <p>Hemos cobrado tu suscripción mensual y tu licencia de TradeKopier se ha extendido
          ${dias} días más. No tienes que hacer nada.</p>
          <p>Cualquier duda, respóndenos a este email.</p>
        </div>
      `,
    }),
  });
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    return new Response(`Firma inválida: ${(err as Error).message}`, { status: 400 });
  }

  // ---- 1) Checkout completado ----
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email ?? session.customer_email;
    if (!email) return new Response(JSON.stringify({ received: true }), { status: 200 });

    if (session.mode === "subscription") {
      const amountTotal = session.amount_total ?? 0;
      const key = `TK-${randomBlock()}-${randomBlock()}-${randomBlock()}`;

      if (amountTotal === 0) {
        // Mensual con prueba gratis de 7 días — la licencia empieza YA, no se cobra nada.
        const { error } = await supabase.from("licenses").insert({
          license_key: key,
          email,
          validity_days: 7,
          plan: "trial",
          stripe_subscription_id: session.subscription as string,
          stripe_customer_id: session.customer as string,
        });
        if (!error) {
          await enviarEmailLicencia(email, key, 7, true);
        } else {
          console.error("Error creando licencia de prueba:", error);
        }
      } else {
        // Trimestral o Semestral — suscripción sin prueba, se cobra ya mismo.
        const dias = diasPorImporte(amountTotal);
        const { error } = await supabase.from("licenses").insert({
          license_key: key,
          email,
          validity_days: dias,
          plan: "paid",
          stripe_subscription_id: session.subscription as string,
          stripe_customer_id: session.customer as string,
          // Guardamos la factura de este primer cobro para que el invoice.paid
          // correspondiente no vuelva a sumar estos mismos días de propina.
          initial_invoice_id: (session.invoice as string) ?? null,
        });
        if (!error) {
          await enviarEmailLicencia(email, key, dias, false);
        } else {
          console.error("Error creando licencia:", error);
        }
      }
    } else {
      // Pago único (caso antiguo, ya no se usa con los 3 planes actuales, pero se
      // mantiene por compatibilidad).
      const amountTotal = session.amount_total ?? 0;
      const dias = diasPorImporte(amountTotal);
      const key = `TK-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
      const { error } = await supabase.from("licenses").insert({
        license_key: key,
        email,
        validity_days: dias,
        plan: "paid",
      });
      if (!error) {
        await enviarEmailLicencia(email, key, dias, false);
      } else {
        console.error("Error creando licencia:", error);
      }
    }
  }

  // ---- 2) Cobro de la suscripción realizado (fin de la prueba, o renovación mensual) ----
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoice.subscription as string | null;
    if (subscriptionId) {
      const { data: licencia, error: errorBusqueda } = await supabase
        .from("licenses")
        .select("*")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();

      if (errorBusqueda) {
        console.error("Error buscando licencia por suscripción:", errorBusqueda);
      } else if (licencia && licencia.initial_invoice_id && licencia.initial_invoice_id === invoice.id) {
        // Es la misma factura del primer cobro (Trimestral/Semestral) que ya
        // procesamos en checkout.session.completed — no sumar días de nuevo.
      } else if (licencia) {
        const dias = diasPorImporte(invoice.amount_paid ?? 0);
        const base =
          licencia.expires_at && new Date(licencia.expires_at) > new Date()
            ? new Date(licencia.expires_at)
            : new Date();
        base.setDate(base.getDate() + dias);

        const eraPagada = licencia.plan === "paid";

        const { error: errorUpdate } = await supabase
          .from("licenses")
          .update({ expires_at: base.toISOString(), plan: "paid" })
          .eq("id", licencia.id);

        if (errorUpdate) {
          console.error("Error extendiendo licencia tras cobro:", errorUpdate);
        } else if (eraPagada) {
          // Solo avisamos por email en renovaciones (no en el primer cobro que
          // sigue a la prueba mensual, para no duplicar el email de bienvenida).
          await enviarEmailRenovacion(licencia.email, dias);
        }
      } else {
        console.warn(`invoice.paid sin licencia asociada para subscription ${subscriptionId}`);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
