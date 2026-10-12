-- A teacher's 100% coupon, and coupons in her class roster.
--
-- 1. A coupon that covers the whole price (e.g. PRUEBAEVE, 100%) could not be
--    used: PayPal cannot take $0, so the page refused it. Now:
--      · book_class_free_with_teacher_coupon — books the class at $0 with her coupon;
--      · claim_teacher_pass_with_coupon      — issues her pass at $0 with her coupon.
--    Both check on the server that the coupon is hers and really makes it $0
--    (teacher_price), and never apply on top of the local discount.
-- 2. Her class roster shows how each student pays: the coupon, the local
--    discount, the pass or membership used, the ID (teacher_session_roster).
-- 3. She can add or change a student's coupon by hand
--    (teacher_set_student_coupon) — not for a student who paid online or uses
--    a pass. The booking guard lets only this function change those columns.
--
-- Additive (new functions; the booking guard gains one early exit). Rollback at the bottom.

-- 1a ───────────────────────────────────────────────────────────────────────────
create or replace function public.book_class_free_with_teacher_coupon(
  _schedule_id uuid, _guest_name text, _guest_email text, _guest_phone text,
  _coupon text, _id_document text default null, _id_document_type text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  v_teacher uuid;
  v_quote jsonb;
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(_guest_name, ''));
  v_email text := lower(btrim(coalesce(_guest_email, '')));
  v_type text := case when _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
begin
  if v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or btrim(coalesce(_guest_phone, '')) = '' then
    raise exception 'Your name, email and phone are needed';
  end if;
  if btrim(coalesce(_id_document, '')) = '' then raise exception 'Your ID is needed'; end if;

  select cs.id, cs.start_time, cs.is_cancelled, cs.spots_remaining, cs.instructor,
         c.id as class_id, c.title, c.price, c.is_active, c.instructor as class_instructor, c.full_price_only
    into s
  from public.class_schedule cs join public.classes c on c.id = cs.class_id
  where cs.id = _schedule_id;
  if not found or s.is_cancelled or not coalesce(s.is_active, false) then raise exception 'This class is not available'; end if;
  if s.start_time <= now() then raise exception 'This class has already started — online booking is closed.'; end if;
  if coalesce(s.spots_remaining, 1) <= 0 then raise exception 'This class is full'; end if;
  if coalesce(s.full_price_only, false) then raise exception '% is always paid in full — coupons cannot be used for it', s.title; end if;

  select t.id into v_teacher from public.teachers t
  where t.active and public.norm_name(t.display_name)
        = public.norm_name(coalesce(nullif(btrim(s.instructor), ''), s.class_instructor, ''))
  limit 1;
  if v_teacher is null then raise exception 'That coupon is not valid for this class'; end if;

  -- Her price for this guest. A cédula's local discount wins over any coupon.
  v_quote := public.teacher_price(v_teacher, s.price,
    case when v_type = 'cr_cedula' then _id_document end, _coupon);
  if coalesce(v_quote->>'coupon_status', '') <> 'applied' or (v_quote->>'price')::numeric > 0 then
    raise exception 'That coupon does not cover this class in full';
  end if;

  if exists (select 1 from public.class_bookings b
             where b.schedule_id = _schedule_id and lower(b.guest_email) = v_email and b.status <> 'cancelled') then
    raise exception 'You are already booked into this class';
  end if;

  insert into public.class_bookings (
    id, schedule_id, user_id, guest_name, guest_email, guest_phone,
    status, payment_status, payment_method, coupon_code, discount_amount, total_price,
    id_document, id_document_type, source
  ) values (
    v_id, _schedule_id, auth.uid(), v_name, v_email, btrim(_guest_phone),
    'confirmed', 'not_required', 'free', v_quote->>'coupon', (v_quote->>'discount')::numeric, 0,
    left(btrim(_id_document), 40), v_type, 'online'
  );
  return v_id;
end $$;

-- 1b ───────────────────────────────────────────────────────────────────────────
-- A pass given with a coupon is told apart from one bought or made in her panel.
alter table public.user_offerings drop constraint if exists user_offerings_source_check;
alter table public.user_offerings add constraint user_offerings_source_check
  check (source = any (array['purchase', 'admin_grant', 'order', 'teacher_order', 'coupon']));

create or replace function public.claim_teacher_pass_with_coupon(
  _membership_id uuid, _guest_name text, _guest_email text, _guest_phone text,
  _coupon text, _id_document text default null, _id_document_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m record;
  v_quote jsonb;
  v_code text;
  v_token text;
  v_id uuid;
  v_user uuid;
  v_name text := btrim(coalesce(_guest_name, ''));
  v_email text := lower(btrim(coalesce(_guest_email, '')));
  v_type text := case when _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
begin
  if v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or btrim(coalesce(_guest_phone, '')) = '' then
    raise exception 'Your name, email and phone are needed';
  end if;
  if btrim(coalesce(_id_document, '')) = '' then raise exception 'Your ID is needed'; end if;

  select tm.*, t.display_name as teacher_name into m
  from public.teacher_memberships tm join public.teachers t on t.id = tm.teacher_id
  where tm.id = _membership_id and tm.is_active and t.active;
  if not found then raise exception 'This pass is not available'; end if;

  v_quote := public.teacher_price(m.teacher_id, coalesce(m.price, 0),
    case when v_type = 'cr_cedula' then _id_document end, _coupon);
  if coalesce(v_quote->>'coupon_status', '') <> 'applied' or (v_quote->>'price')::numeric > 0 then
    raise exception 'That coupon does not cover this pass in full';
  end if;

  -- Same human-friendly code as every pass: AF2270.
  loop
    v_code := chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int)
              || lpad(floor(random()*10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.user_offerings where code = v_code);
  end loop;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  select user_id into v_user from public.profiles where lower(email) = v_email limit 1;

  insert into public.user_offerings (
    user_id, offering_id, teacher_id, teacher_membership_id, type, name_snapshot, price_paid,
    is_unlimited, credits_total, credits_remaining, expires_at,
    status, source, code, access_token, guest_name, guest_email, guest_phone,
    id_document, id_document_type, notes
  ) values (
    v_user, null, m.teacher_id, m.id,
    case when m.classes_included is null then 'membership' else 'class_pass' end,
    m.name, 0,
    m.classes_included is null, m.classes_included, m.classes_included,
    case when m.valid_days is not null then now() + (m.valid_days || ' days')::interval end,
    'active', 'coupon', v_code, v_token, v_name, v_email, btrim(_guest_phone),
    left(btrim(_id_document), 40), v_type,
    format('Free with %s''s coupon %s', m.teacher_name, v_quote->>'coupon')
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'code', v_code, 'offering_name', m.name, 'coupon', v_quote->>'coupon');
end $$;

revoke all on function public.book_class_free_with_teacher_coupon(uuid, text, text, text, text, text, text) from public;
revoke all on function public.claim_teacher_pass_with_coupon(uuid, text, text, text, text, text, text) from public;
grant execute on function public.book_class_free_with_teacher_coupon(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.claim_teacher_pass_with_coupon(uuid, text, text, text, text, text, text) to anon, authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────
create or replace function public.teacher_session_roster(_schedule_id uuid)
returns table(
  id uuid, schedule_id uuid, guest_name text, guest_email text, guest_phone text,
  status text, payment_status text, payment_method text, total_price numeric,
  user_offering_id uuid, source text, attended boolean, client_type text,
  coupon_code text, discount_amount numeric, local_discount boolean,
  id_document text, id_document_type text, pass_name text, pass_code text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.schedule_id, b.guest_name, b.guest_email, b.guest_phone,
         b.status, b.payment_status, b.payment_method, b.total_price,
         b.user_offering_id, b.source, b.attended, b.client_type,
         b.coupon_code, b.discount_amount, coalesce(b.local_discount, false),
         b.id_document, b.id_document_type, uo.name_snapshot, uo.code
  from public.class_bookings b
  left join public.user_offerings uo on uo.id = b.user_offering_id
  where b.schedule_id = _schedule_id
    and (public.is_own_class_session(_schedule_id)
         or public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))
  order by b.created_at
$$;
revoke all on function public.teacher_session_roster(uuid) from public, anon;
grant execute on function public.teacher_session_roster(uuid) to authenticated;

-- 3 ────────────────────────────────────────────────────────────────────────────
-- The booking guard: one early exit for teacher_set_student_coupon only (it
-- sets this flag for its own transaction; nothing on the website can).
create or replace function public.class_bookings_restrict_customer_updates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_teacher boolean := false;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'manager') THEN
    RETURN NEW;
  END IF;
  -- A teacher setting a student's coupon through teacher_set_student_coupon().
  IF coalesce(current_setting('holis.teacher_coupon_update', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.class_schedule s
    JOIN public.classes  c ON c.id = s.class_id
    JOIN public.teachers t ON lower(t.display_name)
                            = lower(coalesce(nullif(s.instructor, ''), c.instructor, ''))
    WHERE s.id = NEW.schedule_id
      AND t.user_id = auth.uid()
      AND t.active
  ) INTO v_teacher;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change class booking owner';
  END IF;
  IF NEW.schedule_id IS DISTINCT FROM OLD.schedule_id THEN
    RAISE EXCEPTION 'Cannot change class schedule';
  END IF;
  IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
    RAISE EXCEPTION 'Cannot change class booking price';
  END IF;
  IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    RAISE EXCEPTION 'Cannot change discount amount';
  END IF;
  IF NEW.coupon_code IS DISTINCT FROM OLD.coupon_code THEN
    RAISE EXCEPTION 'Cannot change coupon code';
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Cannot change payment status';
  END IF;
  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    RAISE EXCEPTION 'Cannot change payment id';
  END IF;

  -- The teacher keeps her own roster.
  IF v_teacher THEN RETURN NEW; END IF;

  -- Everyone else: cancelling is the only status change allowed from a client.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Customers may only cancel their class bookings';
  END IF;

  RETURN NEW;
END;
$function$;

-- Her coupon on a student she added or who pays her at the class. Empty = remove it.
create or replace function public.teacher_set_student_coupon(_booking_id uuid, _coupon text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  b record;
  v_quote jsonb;
  v_wanted text := upper(btrim(coalesce(_coupon, '')));
  v_price numeric;
begin
  if v_teacher is null then raise exception 'Not a teacher' using errcode = '42501'; end if;
  select cb.*, c.price as class_price into b
  from public.class_bookings cb
  join public.class_schedule cs on cs.id = cb.schedule_id
  join public.classes c on c.id = cs.class_id
  where cb.id = _booking_id;
  if not found or not public.is_own_class_session(b.schedule_id) then
    raise exception 'Not your student' using errcode = '42501';
  end if;
  if b.user_offering_id is not null then
    raise exception 'This student uses a pass or membership — no coupon is needed';
  end if;
  if b.payment_status = 'paid' or b.payment_method in ('paypal', 'card') then
    raise exception 'This student already paid online — the price cannot change';
  end if;
  v_price := coalesce(b.class_price, 0);

  perform set_config('holis.teacher_coupon_update', 'on', true);
  if v_wanted = '' then
    update public.class_bookings set
      coupon_code = null, discount_amount = 0, total_price = v_price,
      payment_method = case when payment_method = 'free' and coupon_code is not null then 'cash' else payment_method end,
      payment_status = case when payment_method = 'free' and coupon_code is not null then 'pending' else payment_status end
    where id = _booking_id;
    perform set_config('holis.teacher_coupon_update', 'off', true);
    return jsonb_build_object('coupon', null, 'discount', 0, 'price', v_price);
  end if;

  v_quote := public.teacher_price(v_teacher, v_price, null, v_wanted);
  if coalesce(v_quote->>'coupon_status', '') <> 'applied' then
    perform set_config('holis.teacher_coupon_update', 'off', true);
    raise exception 'That is not one of your active coupons';
  end if;
  update public.class_bookings set
    coupon_code = v_quote->>'coupon',
    discount_amount = (v_quote->>'discount')::numeric,
    total_price = (v_quote->>'price')::numeric,
    payment_method = case when (v_quote->>'price')::numeric <= 0 then 'free' else payment_method end,
    payment_status = case when (v_quote->>'price')::numeric <= 0 then 'not_required' else payment_status end
  where id = _booking_id;
  perform set_config('holis.teacher_coupon_update', 'off', true);
  return jsonb_build_object('coupon', v_quote->>'coupon', 'discount', (v_quote->>'discount')::numeric,
    'price', (v_quote->>'price')::numeric);
end $$;
revoke all on function public.teacher_set_student_coupon(uuid, text) from public, anon;
grant execute on function public.teacher_set_student_coupon(uuid, text) to authenticated;

-- Rollback (by hand):
--   drop function if exists public.teacher_set_student_coupon(uuid, text);
--   drop function if exists public.teacher_session_roster(uuid);
--   drop function if exists public.claim_teacher_pass_with_coupon(uuid, text, text, text, text, text, text);
--   drop function if exists public.book_class_free_with_teacher_coupon(uuid, text, text, text, text, text, text);
--   -- class_bookings_restrict_customer_updates: re-create it without the holis.teacher_coupon_update exit.
--   alter table public.user_offerings drop constraint user_offerings_source_check;
--   alter table public.user_offerings add constraint user_offerings_source_check
--     check (source = any (array['purchase', 'admin_grant', 'order', 'teacher_order']));
