-- Website bookings get the same staff details as calendar entries, each in its
-- own field instead of typed into the notes: who booked it (and how), who
-- confirmed it, who earns the commission, and a link (e.g. the card form).
-- Client, service and price already have their own fields on bookings.
--
-- Additive: nullable columns; old bookings keep their notes as they are.
alter table public.bookings
  add column if not exists booked_by text,
  add column if not exists confirmed_by text,
  add column if not exists commission_to text,
  add column if not exists link_url text,
  add column if not exists link_label text;

-- Only http(s) links, so a "javascript:" address can never be clicked.
alter table public.bookings drop constraint if exists bookings_link_url_check;
alter table public.bookings
  add constraint bookings_link_url_check
  check (link_url is null or link_url ~* '^https?://');

-- The public booking form inserts into bookings; these are the team's own
-- fields, so anything a guest sends in them is dropped.
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
  return new;
end;
$$;

drop trigger if exists bookings_staff_details_guard on public.bookings;
create trigger bookings_staff_details_guard
  before insert on public.bookings
  for each row execute function public.bookings_staff_details_guard();

-- Duplicate copies the notes, so it copies these details too.
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
     booked_by, confirmed_by, commission_to, link_url, link_label)
  values
    (v_new, v_src.service_id, null, v_src.booking_date, v_src.booking_time, v_src.guest_name,
     v_src.guest_email, v_src.guest_phone, v_src.notes, v_src.total_price, null, 0,
     'confirmed', v_src.intake_form, v_src.staff_id,
     null, null, null, null, null,
     v_src.booked_by, v_src.confirmed_by, v_src.commission_to, v_src.link_url, v_src.link_label);

  insert into public.booking_card_authorizations
    (booking_id, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text)
  select v_new, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text
  from public.booking_card_authorizations where booking_id = _booking_id;

  return v_new;
end $function$;
