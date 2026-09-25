-- Classes that are always paid in full.
--
-- Wellness Sunday is not part of what a pass or a membership buys, and it is
-- not discountable either. Rather than name it in the code, a class carries a
-- flag: the booking paths and the coupon check read it, so tomorrow another
-- class can be set the same way from the Admin without touching any of this.
--
-- Everything else keeps working exactly as it does today.

alter table public.classes
  add column if not exists full_price_only boolean not null default false;

comment on column public.classes.full_price_only is
  'Paid in full, always: no pass, no membership and no coupon may be used for it.';

update public.classes set full_price_only = true where title ilike '%wellness sunday%';

-- ── The three ways a pass can be spent all have to refuse it ───────────────

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
  select * into uo from public.user_offerings where id = _user_offering_id for update;
  if not found then raise exception 'Pass not found'; end if;

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

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'redemption_type', v_type,
    'credits_remaining', case when uo.is_unlimited then null else uo.credits_remaining - 1 end
  );
end;
$fn$;

revoke all on function public.book_class_with_offering(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.book_class_with_offering(uuid, uuid, text, text, text) to authenticated;

-- The Admin adding somebody with their pass.
create or replace function public.admin_book_class_with_offering(
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
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;

  select * into uo from public.user_offerings where id = _user_offering_id for update;
  if not found then raise exception 'Pass not found'; end if;
  if uo.status <> 'active' then raise exception 'Pass is %', uo.status; end if;
  if uo.expires_at is not null and uo.expires_at < now() then
    update public.user_offerings set status = 'expired' where id = uo.id;
    raise exception 'Pass has expired';
  end if;
  if not uo.is_unlimited and coalesce(uo.credits_remaining, 0) <= 0 then
    raise exception 'Pass has no credits remaining';
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
              where schedule_id = _schedule_id and user_offering_id = uo.id and status <> 'cancelled') then
    raise exception 'This pass is already booked into this class';
  end if;

  if sch.spots_remaining <= 0 then raise exception 'This class is full'; end if;

  v_type := case when uo.is_unlimited then 'membership' else 'credits' end;
  v_booking_id := gen_random_uuid();

  insert into public.class_bookings (id, schedule_id, user_id, guest_name, guest_email, guest_phone,
                                     status, payment_status, payment_method, user_offering_id, total_price)
  values (v_booking_id, sch.id, uo.user_id,
          coalesce(nullif(btrim(_guest_name), ''), uo.guest_name),
          coalesce(nullif(btrim(_guest_email), ''), uo.guest_email),
          coalesce(nullif(btrim(_guest_phone), ''), uo.guest_phone),
          'confirmed', 'paid', v_type, uo.id, 0);

  if not uo.is_unlimited then
    update public.user_offerings
       set credits_remaining = credits_remaining - 1,
           status = case when credits_remaining - 1 <= 0 then 'depleted' else 'active' end
     where id = uo.id;
  end if;

  insert into public.offering_redemptions (user_offering_id, user_id, class_booking_id, credits_used, redemption_type)
  values (uo.id, uo.user_id, v_booking_id, case when uo.is_unlimited then 0 else 1 end, v_type);

  update public.class_schedule set spots_remaining = spots_remaining - 1
   where id = sch.id and spots_remaining > 0;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'redemption_type', v_type,
    'credits_remaining', case when uo.is_unlimited then null else uo.credits_remaining - 1 end
  );
end;
$fn$;

-- The emailed no-login link.
create or replace function public.book_class_with_membership_token(_token text, _schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uo  record;
  sch record;
  v_booking_id uuid;
  v_type text;
begin
  select * into uo from public.user_offerings
    where access_token = _token and _token is not null limit 1 for update;
  if not found then raise exception 'Invalid membership link'; end if;
  if uo.status <> 'active' then raise exception 'Membership is not active'; end if;
  if uo.expires_at is not null and uo.expires_at < now() then
    update public.user_offerings set status='expired' where id=uo.id;
    raise exception 'Membership has expired';
  end if;
  if not uo.is_unlimited and coalesce(uo.credits_remaining,0) <= 0 then
    raise exception 'No credits remaining';
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
     and not exists (select 1 from public.offering_eligible_classes where offering_id = uo.offering_id and class_id = sch.class_id) then
    raise exception 'This membership does not cover this class';
  end if;

  if exists (select 1 from public.class_bookings
              where schedule_id = _schedule_id and user_offering_id = uo.id and status <> 'cancelled') then
    raise exception 'This pass is already booked into this class';
  end if;

  if sch.spots_remaining <= 0 then raise exception 'This class is full'; end if;

  v_type := case when uo.is_unlimited then 'membership' else 'credits' end;
  v_booking_id := gen_random_uuid();

  insert into public.class_bookings (id, schedule_id, user_id, guest_name, guest_email, guest_phone,
                                     status, payment_status, payment_method, user_offering_id, total_price)
  values (v_booking_id, sch.id, uo.user_id, uo.guest_name, uo.guest_email, uo.guest_phone,
          'confirmed', 'paid', v_type, uo.id, 0);

  if not uo.is_unlimited then
    update public.user_offerings
      set credits_remaining = credits_remaining - 1,
          status = case when credits_remaining - 1 <= 0 then 'depleted' else 'active' end
      where id = uo.id;
  end if;

  insert into public.offering_redemptions (user_offering_id, user_id, class_booking_id, credits_used, redemption_type)
  values (uo.id, uo.user_id, v_booking_id, case when uo.is_unlimited then 0 else 1 end, v_type);

  update public.class_schedule set spots_remaining = spots_remaining - 1
    where id = sch.id and spots_remaining > 0;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'redemption_type', v_type,
    'guest_email', uo.guest_email,
    'credits_remaining', case when uo.is_unlimited then null else uo.credits_remaining - 1 end
  );
end;
$fn$;
