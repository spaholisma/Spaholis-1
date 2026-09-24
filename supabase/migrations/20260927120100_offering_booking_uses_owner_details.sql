-- A membership books its owner into class — nobody else.
--
-- Booking with a pass or membership while signed in (book_class_with_offering)
-- took the name and email typed on the page, so a member could book a friend
-- into a class for free under the friend's name, and the class list would show
-- the friend. The page now fills them from the account and locks them; this
-- makes the server hold to the same, so it cannot be worked around:
--
--   the owner's account (profile) → what is on the pass → only then what was
--   typed, for someone we know nothing about.
--
-- The phone is not a name: a typed phone is still taken. The team
-- (super_admin, manager) may still book a pass holder under the name they
-- give — they use admin_book_class_with_offering anyway. The no-login link
-- (book_class_with_membership_token) already used the pass's own details.
-- Everything else in the function is unchanged.
create or replace function public.book_class_with_offering(
  _user_offering_id uuid,
  _schedule_id uuid,
  _guest_name text default null,
  _guest_email text default null,
  _guest_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uo           record;
  sch          record;
  prof         record;
  v_booking_id uuid;
  v_type       text;
  v_staff      boolean := has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager');
  v_name       text;
  v_email      text;
  v_phone      text;
begin
  select * into uo from public.user_offerings where id = _user_offering_id for update;
  if not found then raise exception 'Pass not found'; end if;

  if uo.user_id is distinct from auth.uid() and not v_staff then
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

  select cs.id, cs.spots_remaining, cs.class_id, c.full_price_only, c.title into sch
    from public.class_schedule cs
    join public.classes c on c.id = cs.class_id
   where cs.id = _schedule_id;
  if not found then raise exception 'Class not found'; end if;

  if sch.full_price_only then
    raise exception '% is always paid in full — passes and memberships cannot be used for it', sch.title;
  end if;

  if exists (select 1 from public.offering_eligible_classes where offering_id = uo.offering_id)
     and not exists (select 1 from public.offering_eligible_classes
                     where offering_id = uo.offering_id and class_id = sch.class_id) then
    raise exception 'This pass does not cover this class';
  end if;

  if exists (select 1 from public.class_bookings
              where schedule_id = _schedule_id
                and user_offering_id = uo.id
                and status <> 'cancelled') then
    raise exception 'This pass is already booked into this class';
  end if;

  if sch.spots_remaining <= 0 then raise exception 'This class is full'; end if;

  -- Who the booking is for: the owner.
  select full_name, email, phone into prof from public.profiles where user_id = uo.user_id;
  if v_staff then
    v_name  := coalesce(nullif(btrim(_guest_name), ''),  nullif(btrim(prof.full_name), ''), uo.guest_name);
    v_email := coalesce(nullif(btrim(_guest_email), ''), nullif(btrim(prof.email), ''),     uo.guest_email);
  else
    v_name  := coalesce(nullif(btrim(prof.full_name), ''), nullif(btrim(uo.guest_name), ''),  nullif(btrim(_guest_name), ''));
    v_email := coalesce(nullif(btrim(prof.email), ''),     nullif(btrim(uo.guest_email), ''), nullif(btrim(_guest_email), ''));
  end if;
  v_phone := coalesce(nullif(btrim(_guest_phone), ''), nullif(btrim(prof.phone), ''), uo.guest_phone);

  v_type := case when uo.is_unlimited then 'membership' else 'credits' end;
  v_booking_id := gen_random_uuid();

  insert into public.class_bookings (
    id, schedule_id, user_id, guest_name, guest_email, guest_phone,
    status, payment_status, payment_method, user_offering_id, total_price
  ) values (
    v_booking_id, sch.id, uo.user_id,
    v_name, v_email, v_phone,
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

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'redemption_type', v_type,
    'credits_remaining', case when uo.is_unlimited then null else uo.credits_remaining - 1 end
  );
end;
$fn$;
