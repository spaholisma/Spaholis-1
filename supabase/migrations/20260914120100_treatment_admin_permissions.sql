-- Treatments calendar: full editing for Susana, full reading for the device.
--
-- Susana Alfaro is a coordinator: she sees only the calendars, appointments and
-- trash, and could reschedule and cancel but not change a booking's service,
-- room, price, discount or therapist, reveal the card, or duplicate a booking.
-- The owner wants her to manage the Treatments calendar exactly as an admin
-- does. She keeps the coordinator role (which scopes the admin panel to the
-- calendar) and gains treatment_admin, which lifts those limits. Anja Mengler,
-- the other coordinator, stays as she is.
--
-- holisdevices (viewer) saw only guest name, service, time, room and status.
-- get_treatment_booking_detail returns the whole booking for the calendar's
-- read-only view. The card is masked (brand, last four, expiry, holder); the
-- full number stays behind the audited reveal, which a viewer cannot call.

-- 1. Susana gets the role.
insert into public.user_roles (user_id, role)
select u.id, 'treatment_admin'::public.app_role
from auth.users u
where lower(u.email) = 'susanalifehope21@icloud.com'
  and not exists (
    select 1 from public.user_roles r
    where r.user_id = u.id and r.role = 'treatment_admin'::public.app_role
  );

-- 2. A treatment admin may change any field of a booking.
create or replace function public.bookings_restrict_customer_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  -- Trusted card-on-file confirmation flow (flag set only inside
  -- save_card_authorization, never reachable by a normal client update).
  if current_setting('holis.card_auth_flow', true) = '1' then return new; end if;
  if has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')
     or has_role(auth.uid(), 'treatment_admin') then
    return new;
  end if;

  if not has_role(auth.uid(), 'coordinator') then
    raise exception 'Bookings cannot be changed online. To cancel or change an appointment, email us at spaholisma@gmail.com.';
  end if;

  if new.user_id is distinct from old.user_id then raise exception 'Cannot change booking owner'; end if;
  if new.service_id is distinct from old.service_id then raise exception 'Cannot change booking service'; end if;
  if new.room_id is distinct from old.room_id then raise exception 'Cannot change booking room'; end if;
  if new.staff_id is distinct from old.staff_id then raise exception 'Cannot change booking staff'; end if;
  if new.total_price is distinct from old.total_price then raise exception 'Cannot change booking price'; end if;
  if new.discount_amount is distinct from old.discount_amount then raise exception 'Cannot change discount amount'; end if;
  if new.coupon_code is distinct from old.coupon_code then raise exception 'Cannot change coupon code'; end if;
  if new.payment_id is distinct from old.payment_id then raise exception 'Cannot change payment id'; end if;
  if new.notification_sent_at is distinct from old.notification_sent_at then raise exception 'Cannot change notification tracking'; end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Coordinators may only cancel bookings';
  end if;

  return new;
end;
$$;

-- 3. ...reveal the card on file (still logged in audit_logs)...
create or replace function public.reveal_card_authorization(_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_key text; v_row public.booking_card_authorizations;
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'manager')
          or has_role(auth.uid(),'treatment_admin')) then
    raise exception 'Not authorized';
  end if;
  select * into v_row from public.booking_card_authorizations where booking_id = _booking_id;
  if not found then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='card_enc_key';

  insert into public.audit_logs(action, target_id, result, details)
    values ('card.reveal', _booking_id, 'revealed', jsonb_build_object('by', auth.uid(), 'at', now()));

  return jsonb_build_object(
    'card_number', extensions.pgp_sym_decrypt(v_row.card_encrypted, v_key),
    'cardholder', v_row.cardholder_name, 'expiry', v_row.card_expiry,
    'brand', v_row.card_brand, 'last4', v_row.card_last4,
    'authorization_text', v_row.authorization_text
  );
end $function$;

-- 4. ...and duplicate a booking.
create or replace function public.duplicate_booking(_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new uuid := gen_random_uuid();
  v_src public.bookings;
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'manager')
          or has_role(auth.uid(),'treatment_admin')) then
    raise exception 'Not authorized';
  end if;
  select * into v_src from public.bookings where id = _booking_id;
  if not found then raise exception 'Booking not found'; end if;

  insert into public.bookings
    (id, service_id, user_id, booking_date, booking_time, guest_name, guest_email, guest_phone,
     notes, total_price, coupon_code, discount_amount, status, intake_form, staff_id,
     room_id, secondary_room_id, start_time, end_time, payment_id)
  values
    (v_new, v_src.service_id, null, v_src.booking_date, v_src.booking_time, v_src.guest_name,
     v_src.guest_email, v_src.guest_phone, v_src.notes, v_src.total_price, null, 0,
     'confirmed', v_src.intake_form, v_src.staff_id,
     null, null, null, null, null);

  -- Carry the card on file over (same customer; ciphertext copied as-is).
  insert into public.booking_card_authorizations
    (booking_id, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text)
  select v_new, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text
  from public.booking_card_authorizations where booking_id = _booking_id;

  return v_new;
end $function$;

-- 5. The whole treatment booking, for the calendar's read-only view.
--    The legacy card_authorization column is left out: it predates the
--    encrypted table and must never reach a browser.
create or replace function public.get_treatment_booking_detail(_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not (has_role(auth.uid(), 'viewer') or has_role(auth.uid(), 'coordinator')
          or has_role(auth.uid(), 'manager') or has_role(auth.uid(), 'super_admin')) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select (to_jsonb(b.*) - 'card_authorization')
         || jsonb_build_object(
              'service', jsonb_build_object(
                'title', s.title, 'category', s.category, 'type', s.type,
                'duration_minutes', coalesce(s.duration_minutes, 60)),
              'card', (
                select jsonb_build_object(
                  'card_brand', c.card_brand, 'card_last4', c.card_last4,
                  'card_expiry', c.card_expiry, 'cardholder_name', c.cardholder_name)
                from public.booking_card_authorizations c
                where c.booking_id = b.id))
    into v
  from public.bookings b
  join public.services s on s.id = b.service_id
  where b.id = _booking_id and s.type = 'treatment';

  return v;
end;
$$;

revoke all on function public.get_treatment_booking_detail(uuid) from public, anon;
grant execute on function public.get_treatment_booking_detail(uuid) to authenticated;
