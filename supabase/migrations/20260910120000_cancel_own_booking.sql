-- Let a guest cancel their own appointment from the client dashboard.
--
-- This runs as a SECURITY DEFINER function rather than a plain UPDATE from the
-- browser because the 24-hour rule decides real money: the card on file is
-- charged 50% for a late cancellation. A client-side check alone could be
-- skipped by calling the API directly, so the window is measured here, on the
-- server clock, and the result is what the confirmation email quotes.
--
-- Changing the treatment, the date or the time is deliberately NOT possible
-- here. Those go through WhatsApp or email so a person sees them.

create or replace function public.cancel_own_booking(_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings%rowtype;
  v_starts_at timestamptz;
  v_hours     numeric;
  v_fee_pct   integer;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = _booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- Only the guest who made it. Guest bookings (user_id null) have no owner
  -- and are cancelled by the team instead.
  if v_booking.user_id is distinct from v_uid then
    raise exception 'This booking is not yours' using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'This booking was already cancelled' using errcode = '22023';
  end if;
  if v_booking.status not in ('pending', 'confirmed', 'paid') then
    raise exception 'This booking can no longer be cancelled online' using errcode = '22023';
  end if;

  -- start_time is the real instant. At-location visits have none, so fall back
  -- to the date + wall clock, which are stored in spa-local time.
  v_starts_at := coalesce(
    v_booking.start_time,
    (v_booking.booking_date + coalesce(v_booking.booking_time, '00:00'::time))
      at time zone 'America/Costa_Rica'
  );

  if v_starts_at <= now() then
    raise exception 'This appointment has already started' using errcode = '22023';
  end if;

  v_hours   := extract(epoch from (v_starts_at - now())) / 3600.0;
  v_fee_pct := case when v_hours < 24 then 50 else 0 end;

  update public.bookings
     set status = 'cancelled',
         notes = trim(both e'\n' from
                   coalesce(notes, '') || e'\n' ||
                   '[Cancelled by the guest ' || to_char(now() at time zone 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') ||
                   ' — ' ||
                   case when v_fee_pct > 0
                        then 'within 24h, charge 50% ($' ||
                             to_char(round(coalesce(total_price, 0) * 0.5, 2), 'FM999999990.00') || ')'
                        else 'more than 24h ahead, no charge' end ||
                   ']'),
         updated_at = now()
   where id = _booking_id;

  return jsonb_build_object(
    'ok', true,
    'fee_percent', v_fee_pct,
    'hours_until', round(v_hours, 1),
    'total_price', v_booking.total_price,
    'fee_amount', round(coalesce(v_booking.total_price, 0) * v_fee_pct / 100.0, 2)
  );
end;
$$;

revoke all on function public.cancel_own_booking(uuid) from public, anon;
grant execute on function public.cancel_own_booking(uuid) to authenticated;

comment on function public.cancel_own_booking(uuid) is
  'Guest-facing cancellation. Enforces the 24h/50% policy server-side and records the outcome in notes.';
