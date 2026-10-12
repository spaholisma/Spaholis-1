-- A coupon makes the ID optional.
--
-- With one of her coupons applied, the guest could not book: both $0 paths
-- refused with "Your ID is needed". The ID is required to pay — but with a
-- coupon it is optional. If one is given it is still stored (and a Costa Rican
-- cédula still gets the local discount instead of the coupon, never both).
--
-- Only the ID check and how an empty ID is stored change; everything else is
-- as in 20261013130000_free_coupons_roster.sql. Rollback: re-run those two
-- functions from that file.

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
  v_doc text := nullif(left(btrim(coalesce(_id_document, '')), 40), '');
  v_type text := case when nullif(btrim(coalesce(_id_document, '')), '') is not null
                       and _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
begin
  if v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or btrim(coalesce(_guest_phone, '')) = '' then
    raise exception 'Your name, email and phone are needed';
  end if;
  -- The ID is optional with a coupon; given, it is kept with the booking.

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
    case when v_type = 'cr_cedula' then v_doc end, _coupon);
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
    v_doc, v_type, 'online'
  );
  return v_id;
end $$;

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
  v_doc text := nullif(left(btrim(coalesce(_id_document, '')), 40), '');
  v_type text := case when nullif(btrim(coalesce(_id_document, '')), '') is not null
                       and _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
begin
  if v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or btrim(coalesce(_guest_phone, '')) = '' then
    raise exception 'Your name, email and phone are needed';
  end if;
  -- The ID is optional with a coupon; given, it is kept with the booking.

  select tm.*, t.display_name as teacher_name into m
  from public.teacher_memberships tm join public.teachers t on t.id = tm.teacher_id
  where tm.id = _membership_id and tm.is_active and t.active;
  if not found then raise exception 'This pass is not available'; end if;

  v_quote := public.teacher_price(m.teacher_id, coalesce(m.price, 0),
    case when v_type = 'cr_cedula' then v_doc end, _coupon);
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
    v_doc, v_type,
    format('Free with %s''s coupon %s', m.teacher_name, v_quote->>'coupon')
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'code', v_code, 'offering_name', m.name, 'coupon', v_quote->>'coupon');
end $$;
