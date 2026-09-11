-- Cancellations move from the website to email, and reception decides the fee.
--
-- The rule: a treatment cancelled within 24 hours of PLACING the booking is
-- charged 50%; after that, and for a no-show, 100%. Guests cancel by emailing
-- the studio, and the time that email arrives is the time of the cancellation —
-- which only reception knows. So nothing is computed here: reception picks the
-- fee when they cancel in the calendar, it is saved with the booking, and the
-- database emails both sides the moment the status turns cancelled, whichever
-- screen did it.

-- 1. The online self-cancel is gone.
drop function if exists public.cancel_own_booking(uuid);

-- 2. What reception decided, and when.
alter table public.bookings
  add column if not exists cancellation_fee_percent smallint
    check (cancellation_fee_percent in (0, 50, 100)),
  add column if not exists cancelled_at timestamptz;

comment on column public.bookings.cancellation_fee_percent is
  'Chosen by reception when cancelling: 0, 50 or 100. Quoted in the cancellation email.';
comment on column public.bookings.cancelled_at is
  'Set when status turns cancelled; cleared if the booking is reinstated.';

-- 3. Stamp the moment of cancellation, and forget it if the booking comes back.
create or replace function public.bookings_track_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
  elsif new.status is distinct from 'cancelled' then
    new.cancelled_at := null;
    new.cancellation_fee_percent := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_track_cancellation on public.bookings;
create trigger bookings_track_cancellation
  before update of status on public.bookings
  for each row execute function public.bookings_track_cancellation();

-- 4. A guest changes nothing online any more.
--
-- Until now a signed-in guest could still set their own booking to cancelled
-- through the API, which would skip the email the policy is built on — and
-- could now also write their own cancellation fee. Guests are refused outright;
-- no guest-side flow updates a booking (the card-on-file step has its own flag).
-- Coordinators keep exactly the limits they had, and may record the fee.
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
  if has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager') then
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
  if new.booking_date is distinct from old.booking_date then raise exception 'Cannot change booking date'; end if;
  if new.booking_time is distinct from old.booking_time then raise exception 'Cannot change booking time'; end if;
  if new.start_time is distinct from old.start_time then raise exception 'Cannot change booking start time'; end if;
  if new.end_time is distinct from old.end_time then raise exception 'Cannot change booking end time'; end if;
  if new.notification_sent_at is distinct from old.notification_sent_at then raise exception 'Cannot change notification tracking'; end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Coordinators may only cancel bookings';
  end if;

  return new;
end;
$$;

-- 5. Email both sides when a real booking is cancelled.
--
-- The trigger signs its call with a secret only the database holds, because
-- the edge function runs without a JWT. The key is generated here and never
-- leaves the database; it is separate from any other notification secret.
insert into public.internal_secrets (name, value)
values ('booking_notify', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.notify_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.internal_secrets where name = 'booking_notify';
  if v_secret is null then return new; end if;

  perform net.http_post(
    url     := 'https://zhdqjtgtolnksiaepxbd.supabase.co/functions/v1/send-booking-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := jsonb_build_object('cancelledBookingId', new.id)
  );
  return new;
exception when others then
  -- An email must never be able to block the cancellation itself.
  raise warning 'notify_booking_cancelled failed: %', sqlerrm;
  return new;
end;
$$;

-- Only real bookings: ones that were confirmed or paid, or whose guest was
-- emailed a confirmation. That leaves out consultation-form entries (bots
-- included) and abandoned checkouts, which never were bookings to anyone.
drop trigger if exists bookings_notify_cancelled on public.bookings;
create trigger bookings_notify_cancelled
  after update of status on public.bookings
  for each row
  when (new.status = 'cancelled'
        and old.status is distinct from 'cancelled'
        and (old.status in ('confirmed', 'paid') or old.notification_sent_at is not null))
  execute function public.notify_booking_cancelled();

revoke all on function public.notify_booking_cancelled() from public, anon, authenticated;
revoke all on function public.bookings_track_cancellation() from public, anon, authenticated;
