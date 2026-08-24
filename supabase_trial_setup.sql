-- ============================================================
-- TradeKopier — Columnas nuevas en licenses para la suscripción
-- mensual con prueba gratuita de 7 días.
-- Pega en Supabase → SQL Editor → New query → Run
-- (No borra ni toca nada de lo que ya tienes; las filas existentes
-- quedan con plan='paid' y las dos columnas de Stripe vacías)
-- ============================================================

alter table licenses add column if not exists plan text not null default 'paid';
alter table licenses add column if not exists stripe_subscription_id text;
alter table licenses add column if not exists stripe_customer_id text;

-- Guarda la factura del primer cobro de Trimestral/Semestral (suscripciones sin
-- prueba) para que el evento invoice.paid de esa misma factura no sume los días
-- dos veces.
alter table licenses add column if not exists initial_invoice_id text;

-- Para poder encontrar rápido la licencia correcta cuando llega el cobro
-- automático de cada renovación (evento invoice.paid).
create index if not exists idx_licenses_subscription
  on licenses (stripe_subscription_id);
