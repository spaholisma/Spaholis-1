-- Couples bookings online failed since the room guard (enforce_couples_room)
-- went in: the website saves a couples treatment as TWO rows (one per person,
-- each with a therapist) — Room 2 + Room 2, or 3A + 3B — and the guard took the
-- second person's row for a clash with the first, so nothing was saved.
-- create-booking then reported a success it never had, and the card step failed
-- with "booking_card_authorizations_booking_id_fkey".
--
-- The guard now recognises the other person of the SAME couples booking (same
-- treatment, same start and end, same email) and lets exactly one such row
-- share the room(s). Anyone else in those rooms is still refused, and so is a
-- third row of the same booking.

create or replace function public.enforce_couples_room()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_title text;
  v_couples_capable boolean;
  v_pairs_with uuid;
  v_is_couples boolean;
  v_pair_first uuid;      -- for 3B: the room it is paired with (3A)
  v_companions int := 0;  -- the other person of this couples booking
  v_others int := 0;      -- anybody else
begin
  -- Only room-based, timed bookings are constrained.
  if new.room_id is null or new.start_time is null or new.end_time is null then
    return new;
  end if;

  select lower(coalesce(s.title, '')) into v_title
    from public.services s where s.id = new.service_id;
  v_is_couples := v_title like '%couple%' or v_title like '%pareja%';

  select r.couples_capable, r.pairs_with_room_id
    into v_couples_capable, v_pairs_with
    from public.rooms r where r.id = new.room_id;

  if v_is_couples then
    if coalesce(v_couples_capable, false) then
      new.secondary_room_id := null;            -- Room 2 on its own
    elsif v_pairs_with is not null then
      new.secondary_room_id := v_pairs_with;    -- 3A + its partner 3B
    else
      -- The second person's row in 3B, next to the first person's in 3A.
      select r.id into v_pair_first from public.rooms r where r.pairs_with_room_id = new.room_id limit 1;
      if v_pair_first is null or not exists (
        select 1 from public.bookings b
        where b.id <> new.id
          and b.status not in ('cancelled', 'payment_failed')
          and b.room_id = v_pair_first
          and b.service_id = new.service_id
          and b.start_time = new.start_time
          and b.end_time = new.end_time
          and lower(b.guest_email) = lower(new.guest_email)
      ) then
        raise exception 'This treatment needs a couples room (Room 2, or 3A + 3B).'
          using errcode = 'check_violation';
      end if;
      new.secondary_room_id := null;
    end if;
  else
    new.secondary_room_id := null;              -- a single treatment holds one room
  end if;

  -- Any occupied room (primary or paired) must be free — count other bookings'
  -- paired rooms too. Skip cancelled / payment_failed.
  select
    count(*) filter (where o.companion),
    count(*) filter (where not o.companion)
  into v_companions, v_others
  from (
    select coalesce(
             v_is_couples
             and b.service_id = new.service_id
             and b.start_time = new.start_time
             and b.end_time = new.end_time
             and lower(b.guest_email) = lower(new.guest_email),
             false) as companion
    from public.bookings b
    where b.id <> new.id
      and b.status not in ('cancelled', 'payment_failed')
      and b.start_time < new.end_time
      and b.end_time > new.start_time
      and (
        b.room_id = new.room_id
        or b.secondary_room_id = new.room_id
        or (new.secondary_room_id is not null
            and (b.room_id = new.secondary_room_id or b.secondary_room_id = new.secondary_room_id))
      )
  ) o;

  if v_others > 0 or v_companions > 1 then
    raise exception 'This time slot was just booked by someone else. Please pick another time.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$function$;
