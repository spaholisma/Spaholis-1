-- Each teacher chooses how her students can pay her online.
--
-- Cash at the class is always on (nothing to choose). On top of it she can
-- switch on:
--   · PayPal      — paid straight to her PayPal account (teachers.paypal_email)
--   · CompraClick — her own BAC CompraClick link; the spot is reserved as
--                   "pending · CompraClick" and she checks the money arrived.

-- 1. Her switches and her CompraClick link.
alter table public.teachers add column if not exists paypal_enabled boolean not null default true;
alter table public.teachers add column if not exists compraclick_enabled boolean not null default false;
alter table public.teachers add column if not exists compraclick_url text;
alter table public.teachers drop constraint if exists teachers_compraclick_url_format;
alter table public.teachers add constraint teachers_compraclick_url_format
  check (compraclick_url is null or compraclick_url ~* '^https://[^[:space:]]+$');

-- 2. A spot reserved to pay her through CompraClick.
alter table public.class_bookings drop constraint if exists class_bookings_payment_method_check;
alter table public.class_bookings add constraint class_bookings_payment_method_check
  check (payment_method is null or payment_method = any (array[
    'paypal'::text, 'membership'::text, 'credits'::text, 'free'::text, 'admin'::text, 'cash'::text,
    'card'::text, 'transfer'::text, 'sinpe'::text, 'gift_card'::text, 'offering'::text,
    'complimentary'::text, 'other'::text, 'compraclick'::text]));

-- 3. What pages may know: does she take PayPal (yes/no, never the email), and
--    her CompraClick link when she has switched it on (a link meant for the public).
drop function if exists public.public_teacher_portfolios();
create function public.public_teacher_portfolios()
 returns table(membership_id uuid, teacher_name text, membership_name text, price numeric,
               classes_included integer, valid_days integer, description text, payment_link text,
               payment_note text, teacher_payment_instructions text, teacher_accepts_paypal boolean,
               teacher_compraclick_url text)
 language sql stable security definer set search_path to 'public'
as $function$
  select m.id, t.display_name, m.name, m.price, m.classes_included, m.valid_days,
         m.description, m.payment_link, m.payment_note, t.payment_instructions,
         (t.paypal_enabled and t.paypal_email is not null and btrim(t.paypal_email) <> ''),
         case when t.compraclick_enabled then nullif(btrim(t.compraclick_url), '') end
  from public.teachers t
  join public.teacher_memberships m on m.teacher_id = t.id
  where t.active and m.is_active
  order by t.display_name, m.price nulls last
$function$;
grant execute on function public.public_teacher_portfolios() to anon, authenticated;

drop function if exists public.public_teachers();
create function public.public_teachers()
 returns table(id uuid, display_name text, photo_url text, bio text, accepts_paypal boolean, compraclick_url text)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.display_name, t.photo_url, t.bio,
         (t.paypal_enabled and t.paypal_email is not null and btrim(t.paypal_email) <> ''),
         case when t.compraclick_enabled then nullif(btrim(t.compraclick_url), '') end
  from public.teachers t
  where t.active
  order by t.display_name
$function$;
grant execute on function public.public_teachers() to anon, authenticated;

-- 4. Reserve a spot to pay the teacher through her CompraClick link.
--    The same checks as book_class_pay_cash; the session's teacher must have
--    CompraClick switched on. Returns her link so the page can send them there.
create or replace function public.book_class_pay_compraclick(
  _schedule_id uuid, _guest_name text, _guest_email text, _guest_phone text,
  _participant_names text[] default null
) returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  s          record;
  v_name     text := btrim(coalesce(_guest_name, ''));
  v_email    text := btrim(coalesce(_guest_email, ''));
  v_phone    text := regexp_replace(coalesce(_guest_phone, ''), '[\s().-]', '', 'g');
  v_names    text[];
  v_count    int;
  v_price    numeric;
  v_held     int;
  v_group    uuid;
  v_id       uuid;
  v_first    uuid;
  v_teacher  text;
  v_link     text;
begin
  if length(v_name) < 2 or length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 255 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'phone_required');
  end if;

  v_names := array[v_name];
  if _participant_names is not null and array_length(_participant_names, 1) > 1 then
    for i in 2 .. array_length(_participant_names, 1) loop
      if length(btrim(coalesce(_participant_names[i], ''))) = 0
         or length(btrim(_participant_names[i])) > 120 then
        return jsonb_build_object('ok', false, 'reason', 'invalid_participants');
      end if;
      v_names := v_names || btrim(_participant_names[i]);
    end loop;
  end if;
  v_count := array_length(v_names, 1);
  if v_count > 10 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_participants');
  end if;

  select sc.start_time, sc.spots_remaining, sc.is_cancelled, sc.instructor,
         c.price, c.requires_payment, c.is_active, c.instructor as class_instructor
    into s
    from public.class_schedule sc
    join public.classes c on c.id = sc.class_id
   where sc.id = _schedule_id
     for update of sc;

  if not found or coalesce(s.is_cancelled, false) or s.is_active is false then
    return jsonb_build_object('ok', false, 'reason', 'class_unavailable');
  end if;
  if s.start_time <= now() then
    return jsonb_build_object('ok', false, 'reason', 'class_started');
  end if;
  if public.is_class_day_closed(s.start_time) then
    return jsonb_build_object('ok', false, 'reason', 'class_day_closed');
  end if;
  v_price := coalesce(s.price, 0);
  if not coalesce(s.requires_payment, false) or v_price <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'class_is_free');
  end if;

  -- The session's teacher, and her CompraClick link.
  v_teacher := coalesce(nullif(btrim(s.instructor), ''), nullif(btrim(s.class_instructor), ''));
  select nullif(btrim(t.compraclick_url), '') into v_link
    from public.teachers t
   where t.active and t.compraclick_enabled
     and lower(btrim(t.display_name)) = lower(coalesce(v_teacher, ''))
   limit 1;
  if v_link is null then
    return jsonb_build_object('ok', false, 'reason', 'teacher_no_compraclick');
  end if;

  if coalesce(s.spots_remaining, 0) < v_count then
    return jsonb_build_object('ok', false, 'reason', 'class_full');
  end if;

  -- Nobody is charged here, so one email cannot hold more than ten unpaid spots.
  select count(*) into v_held
    from public.class_bookings
   where schedule_id = _schedule_id
     and lower(guest_email) = lower(v_email)
     and payment_method in ('cash', 'compraclick') and payment_status = 'pending'
     and status <> 'cancelled';
  if v_held + v_count > 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_spots');
  end if;

  if v_count > 1 then v_group := gen_random_uuid(); end if;
  for i in 1 .. v_count loop
    insert into public.class_bookings (
      schedule_id, user_id, booking_group_id, guest_name, guest_email, guest_phone,
      status, payment_status, payment_method, total_price, discount_amount, source
    ) values (
      _schedule_id, auth.uid(), v_group, v_names[i], v_email, v_phone,
      'confirmed', 'pending', 'compraclick', v_price, 0, 'online'
    ) returning id into v_id;
    if i = 1 then v_first := v_id; end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'booking_id', v_first, 'spots', v_count,
    'amount', v_price * v_count, 'teacher', v_teacher, 'compraclick_url', v_link
  );
end $function$;
revoke all on function public.book_class_pay_compraclick(uuid, text, text, text, text[]) from public;
grant execute on function public.book_class_pay_compraclick(uuid, text, text, text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
