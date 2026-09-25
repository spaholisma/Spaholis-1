-- Booking a class with your own pass: one step, on the server.
--
-- What went wrong (19 Sep 2026, Sophia Wisdom's 5-Class Pass):
--
-- The website booked a class with a pass in two steps from the browser —
-- insert the booking, then call redeem_offering() to take the credit. But
-- redeem_offering() was never granted to `authenticated`, so for a logged-in
-- customer the second step failed every time:
--
--   · the booking row stayed behind, paid for with nothing
--   · no credit was taken and no redemption was recorded
--   · the customer saw an error, tried again, and got another row
--
-- Which is exactly what the pass showed: three bookings, five credits still on
-- it, no redemptions, and the same class booked twice five seconds apart.
--
-- Two steps from a browser can never be made safe. This replaces them with one
-- function that does the whole thing in a single transaction, the same way the
-- Admin (admin_book_class_with_offering) and the emailed link
-- (book_class_with_membership_token) already do.

create or replace function public.book_class_with_offering(
  _user_offering_id uuid,
  _schedule_id      uuid,
  _guest_name       text default null,
  _guest_email      text default null,
  _guest_phone      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uo           record;
  sch          record;
  v_booking_id uuid;
  v_type       text;
begin
  -- Locked for the whole transaction: two taps on the button cannot both pass
  -- the credit check.
  select * into uo from public.user_offerings where id = _user_offering_id for update;
  if not found then raise exception 'Pass not found'; end if;

  -- Your own pass, or a member of staff acting for you.
  if uo.user_id is distinct from auth.uid()
     and not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'This pass belongs to someone else';
  end if;

  if uo.status <> 'active' then raise exception 'This pass is %', uo.status; end if;
  if uo.expires_at is not null and uo.expires_at < now() then
    update public.user_offerings set status = 'expired' where id = uo.id;
    raise exception 'This pass has expired';
  end if;
  if not uo.is_unlimited and coalesce(uo.credits_remaining, 0) <= 0 then
    raise exception 'This pass has no classes left on it';
  end if;

  select cs.id, cs.spots_remaining, cs.class_id into sch
    from public.class_schedule cs where cs.id = _schedule_id;
  if not found then raise exception 'Class not found'; end if;

  -- A pass covers everything unless somebody listed the classes it covers.
  if exists (select 1 from public.offering_eligible_classes where offering_id = uo.offering_id)
     and not exists (select 1 from public.offering_eligible_classes
                     where offering_id = uo.offering_id and class_id = sch.class_id) then
    raise exception 'This pass does not cover this class';
  end if;

  -- One seat per pass per class. Without this, a double tap or a retry after
  -- an error books the same person twice — which is how this started.
  if exists (select 1 from public.class_bookings
              where schedule_id = _schedule_id
                and user_offering_id = uo.id
                and status <> 'cancelled') then
    raise exception 'This pass is already booked into this class';
  end if;

  if sch.spots_remaining <= 0 then raise exception 'This class is full'; end if;

  v_type := case when uo.is_unlimited then 'membership' else 'credits' end;
  v_booking_id := gen_random_uuid();

  insert into public.class_bookings (
    id, schedule_id, user_id, guest_name, guest_email, guest_phone,
    status, payment_status, payment_method, user_offering_id, total_price
  ) values (
    v_booking_id, sch.id, uo.user_id,
    coalesce(nullif(btrim(_guest_name), ''), uo.guest_name),
    coalesce(nullif(btrim(_guest_email), ''), uo.guest_email),
    coalesce(nullif(btrim(_guest_phone), ''), uo.guest_phone),
    'confirmed', 'paid', v_type, uo.id, 0
  );

  if not uo.is_unlimited then
    update public.user_offerings
       set credits_remaining = credits_remaining - 1,
           status = case when credits_remaining - 1 <= 0 then 'depleted' else 'active' end
     where id = uo.id;
  end if;

  insert into public.offering_redemptions (user_offering_id, user_id, class_booking_id, credits_used, redemption_type)
  values (uo.id, uo.user_id, v_booking_id, case when uo.is_unlimited then 0 else 1 end, v_type);

  -- The spots trigger keeps class_schedule in step with the bookings, so the
  -- count is not touched here.

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'redemption_type', v_type,
    'credits_remaining', case when uo.is_unlimited then null else uo.credits_remaining - 1 end
  );
end;
$fn$;

comment on function public.book_class_with_offering(uuid, uuid, text, text, text) is
  'Books a class against the caller''s own pass: checks, booking, credit and redemption in one transaction.';

revoke all on function public.book_class_with_offering(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.book_class_with_offering(uuid, uuid, text, text, text) to authenticated;

-- redeem_offering() stays as it is — ungranted and unused by the website now.
-- It was the half of the old two-step path that customers could never run.
