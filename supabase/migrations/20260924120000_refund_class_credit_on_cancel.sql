-- A class paid with a pass gives the class back when the booking goes away.
--
-- Booking a class with a pass takes a credit and writes a redemption. Undoing
-- the booking undid neither: the Admin's "remove attendee" deletes the row,
-- a customer's own cancel sets it to 'cancelled', and in both cases the pass
-- kept the class as spent. Two customers on 24 Sep 2026 booked and were taken
-- off again, and their passes stayed at 4/5 and 3/5.
--
-- Nothing tied the two together: offering_redemptions.class_booking_id has no
-- foreign key, so deleting a booking left its redemption pointing at nothing.
--
-- The fix lives in the database, so every way a booking can go — the Admin,
-- the customer, a teacher's roster, a script — gives the credit back:
--
--   · the redemption for that booking is removed
--   · whatever it had taken (1 on a pass, 0 on a membership) is put back,
--     never above the size of the pass
--   · a pass that had run out ("depleted") becomes usable again
--
-- It gives back exactly what was spent, and only once: the refund is driven by
-- the redemption row, so a booking with none (card, cash, free) is untouched,
-- and cancelling twice cannot refund twice.

create or replace function public.refund_class_credit(_booking_id uuid, _user_offering_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_back integer;
begin
  if _booking_id is null or _user_offering_id is null then return 0; end if;

  with gone as (
    delete from public.offering_redemptions
     where class_booking_id = _booking_id
       and user_offering_id = _user_offering_id
    returning credits_used
  )
  select coalesce(sum(credits_used), 0) into v_back from gone;

  if v_back > 0 then
    update public.user_offerings
       set credits_remaining = least(
             coalesce(credits_total, coalesce(credits_remaining, 0) + v_back),
             coalesce(credits_remaining, 0) + v_back
           ),
           status = case when status = 'depleted' then 'active' else status end
     where id = _user_offering_id
       and not coalesce(is_unlimited, false);
  end if;

  return v_back;
end;
$fn$;

comment on function public.refund_class_credit(uuid, uuid) is
  'Puts back what a class booking spent from its pass, once, and removes its redemption.';

revoke all on function public.refund_class_credit(uuid, uuid) from public, anon, authenticated;

create or replace function public.trg_class_bookings_refund_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    -- A booking already cancelled gave its credit back at the time.
    if old.status <> 'cancelled' then
      perform public.refund_class_credit(old.id, old.user_offering_id);
    end if;
    return old;
  end if;

  -- UPDATE: only the moment it becomes cancelled.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.refund_class_credit(new.id, new.user_offering_id);
  end if;
  return new;
end;
$fn$;

revoke all on function public.trg_class_bookings_refund_credit() from public, anon, authenticated;

drop trigger if exists trg_class_bookings_refund_credit on public.class_bookings;
create trigger trg_class_bookings_refund_credit
  after delete or update of status on public.class_bookings
  for each row
  when (old.user_offering_id is not null)
  execute function public.trg_class_bookings_refund_credit();

-- ── The passes that already lost a class this way ─────────────────────────
-- Every redemption whose booking was deleted or cancelled is settled the same
-- way the trigger would have done it. On a fresh database this matches nothing.
do $do$
declare r record;
begin
  for r in
    select red.class_booking_id, red.user_offering_id
      from public.offering_redemptions red
      left join public.class_bookings cb on cb.id = red.class_booking_id
     where red.class_booking_id is not null
       and (cb.id is null or cb.status = 'cancelled')
  loop
    perform public.refund_class_credit(r.class_booking_id, r.user_offering_id);
  end loop;
end
$do$;
