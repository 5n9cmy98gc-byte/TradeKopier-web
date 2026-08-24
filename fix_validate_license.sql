-- ============================================================
-- TradeKopier — Fix: validate_license no calculaba expires_at
-- Pega en Supabase → SQL Editor → New query → Run
-- ============================================================

create or replace function validate_license(p_license_key text, p_machine_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  rec licenses%rowtype;
  calculated_expires timestamptz;
begin
  select * into rec from licenses where license_key = p_license_key;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if rec.revoked then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;

  -- Si ya tiene fecha de vencimiento y ya pasó, está expirada.
  if rec.expires_at is not null and rec.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired', 'expires_at', rec.expires_at);
  end if;

  -- Primera vez que se usa esta licencia: la atamos a esta máquina.
  if rec.machine_id is null then
    -- Si todavía no tiene fecha de vencimiento (licencia nueva, basada en
    -- validity_days), la calculamos ahora mismo, en el momento de activarla.
    if rec.expires_at is null then
      calculated_expires := now() + (coalesce(rec.validity_days, 30) || ' days')::interval;
    else
      calculated_expires := rec.expires_at;
    end if;

    update licenses
       set machine_id = p_machine_id, last_validated_at = now(), expires_at = calculated_expires
     where license_key = p_license_key;
    return jsonb_build_object('valid', true, 'reason', 'activated', 'expires_at', calculated_expires);
  end if;

  -- Ya estaba activada en otra máquina distinta: rechazar.
  if rec.machine_id <> p_machine_id then
    return jsonb_build_object('valid', false, 'reason', 'machine_mismatch');
  end if;

  -- Todo correcto: misma máquina, no expirada, no revocada.
  update licenses set last_validated_at = now() where license_key = p_license_key;
  return jsonb_build_object('valid', true, 'reason', 'ok', 'expires_at', rec.expires_at);
end;
$$;
