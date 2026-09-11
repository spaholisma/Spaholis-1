-- The cancellation fee depends on when the guest's request reached the studio,
-- measured against the appointment: more than 48 hours before it is 50%,
-- inside those 48 hours 100%. Reception often processes a request some time
-- after it arrived, so the moment they press Cancel is not the moment that
-- counts. The calendar now asks for the time the request was received,
-- computes the fee from it, and saves it here so the cancellation emails can
-- tell the guest exactly why they are charged what they are charged.

alter table public.bookings
  add column if not exists cancellation_requested_at timestamptz;

comment on column public.bookings.cancellation_requested_at is
  'When the guest''s cancellation request reached the studio; the fee is measured from it. Defaults to the moment of cancelling.';

-- Same trigger as before, now also keeping the request time: defaulted to the
-- moment of cancelling when reception did not give one, and cleared with the
-- rest if the booking is reinstated.
create or replace function public.bookings_track_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
    new.cancellation_requested_at := coalesce(new.cancellation_requested_at, now());
  elsif new.status is distinct from 'cancelled' then
    new.cancelled_at := null;
    new.cancellation_fee_percent := null;
    new.cancellation_requested_at := null;
  end if;
  return new;
end;
$$;
