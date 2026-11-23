-- Website bookings get "Cobrar": what is still to be charged to the client,
-- when it is not the full price (e.g. after a deposit). Price stays as it is.
--
-- Additive: one nullable column; old bookings are left untouched.
alter table public.bookings
  add column if not exists charge_amount numeric(10, 2);

alter table public.bookings drop constraint if exists bookings_charge_amount_check;
alter table public.bookings
  add constraint bookings_charge_amount_check
  check (charge_amount is null or charge_amount >= 0);

-- It is a team field like the others: anything a guest sends in it is dropped.
create or replace function public.bookings_staff_details_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role'
     or has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')
     or has_role(auth.uid(), 'treatment_admin') or has_role(auth.uid(), 'coordinator') then
    return new;
  end if;
  new.booked_by := null;
  new.confirmed_by := null;
  new.commission_to := null;
  new.link_url := null;
  new.link_label := null;
  new.charge_amount := null;
  return new;
end;
$$;

-- Duplicate copies the price and the details, so it copies Cobrar too.
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
     room_id, secondary_room_id, start_time, end_time, payment_id,
     booked_by, confirmed_by, commission_to, link_url, link_label, charge_amount)
  values
    (v_new, v_src.service_id, null, v_src.booking_date, v_src.booking_time, v_src.guest_name,
     v_src.guest_email, v_src.guest_phone, v_src.notes, v_src.total_price, null, 0,
     'confirmed', v_src.intake_form, v_src.staff_id,
     null, null, null, null, null,
     v_src.booked_by, v_src.confirmed_by, v_src.commission_to, v_src.link_url, v_src.link_label,
     v_src.charge_amount);

  insert into public.booking_card_authorizations
    (booking_id, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text)
  select v_new, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text
  from public.booking_card_authorizations where booking_id = _booking_id;

  return v_new;
end $function$;
