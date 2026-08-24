-- ============================================================
-- TradeKopier — Tabla de tickets de soporte (para el chatbot)
-- Pega en Supabase → SQL Editor → New query → Run
-- (No borra ni toca nada de lo que ya tienes)
-- ============================================================

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  message text not null,
  conversation jsonb,
  source text not null default 'chat',
  status text not null default 'open'
);

alter table tickets enable row level security;

-- Solo tú (usuario autenticado del panel de admin) puedes ver y actualizar tickets.
-- Nadie puede insertar directamente desde el navegador: la inserción solo ocurre
-- dentro de la Edge Function "create-ticket", que usa la service role key y por
-- tanto salta la RLS — es la única puerta de entrada, y valida los datos antes.
create policy "admin_select_tickets" on tickets
  for select
  to authenticated
  using (true);

create policy "admin_update_tickets" on tickets
  for update
  to authenticated
  using (true)
  with check (true);
