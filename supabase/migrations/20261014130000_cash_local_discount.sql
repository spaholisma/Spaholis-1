-- Paying a class in cash at the studio takes Holis' local discount too.
--
-- Every Costa Rican cédula gets the studio's local discount (studio_pricing,
-- Admin → Coupons) — online and, from now on, in cash at the studio. As online,
-- it comes off the booker's spot only, and it is worked out here, by
-- holis_price(), never taken from the browser.
--
-- book_class_pay_cash() takes the guest's ID as two more arguments, both
-- optional: the website still on the old page (no ID sent) books exactly as
-- before, at the full price. Replaced in one transaction, so there is never a
-- moment without it.
--
-- Rollback (by hand): drop this 7-argument version and recreate the 5-argument
-- one of 20260930120000_class_cash_booking.sql as 20261010120000 patched it —
-- the same body as below without the ID lines and the discount.

begin;

drop function if exists public.book_class_pay_cash(uuid, text, text, text, text[]);

create function public.book_class_pay_cash(
  _schedule_id uuid, _guest_name text, _guest_email text, _guest_phone text,
  _participant_names text[] default null, _id_document text default null, _id_document_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  -- The booker's ID, kept as the online booking keeps it.
  v_doc      text := nullif(left(btrim(coalesce(_id_document, '')), 40), '');
  v_doc_type text := case when nullif(btrim(coalesce(_id_document, '')), '') is not null
                           and _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
  v_quote    jsonb;
  v_local    boolean := false;
  v_disc     numeric := 0;
  v_total    numeric := 0;
begin
  if length(v_name) < 2 or length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 255 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  -- International format, as the booking form sends it: +506 8888 8888.
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'phone_required');
  end if;

  -- One name per spot, the booker first (the same shape PayPal uses).
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

  -- Lock the session so two last-minute bookings cannot both take the last spot.
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
  -- She switched "pay cash in person" off for her classes.
  if exists (
    select 1 from public.teachers t
     where t.active and not t.cash_enabled
       and lower(btrim(t.display_name)) = lower(coalesce(nullif(btrim(s.instructor), ''), nullif(btrim(s.class_instructor), ''), ''))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'cash_not_accepted');
  end if;
  v_price := coalesce(s.price, 0);
  if not coalesce(s.requires_payment, false) or v_price <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'class_is_free');
  end if;
  if coalesce(s.spots_remaining, 0) < v_count then
    return jsonb_build_object('ok', false, 'reason', 'class_full');
  end if;

  -- Nobody is charged up front, so one email cannot hold more than ten unpaid
  -- spots in a class — otherwise a class could be filled with no one coming.
  select count(*) into v_held
    from public.class_bookings
   where schedule_id = _schedule_id
     and lower(guest_email) = lower(v_email)
     and payment_method = 'cash' and payment_status = 'pending'
     and status <> 'cancelled';
  if v_held + v_count > 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_spots');
  end if;

  -- Holis' local discount for a valid Costa Rican cédula: the booker's spot.
  if v_doc_type = 'cr_cedula' then
    v_quote := public.holis_price(v_price, v_doc, null, null, null);
    if coalesce((v_quote->>'local')::boolean, false) then
      v_local := true;
      v_disc := coalesce((v_quote->>'discount')::numeric, 0);
    end if;
  end if;

  if v_count > 1 then v_group := gen_random_uuid(); end if;
  for i in 1 .. v_count loop
    insert into public.class_bookings (
      schedule_id, user_id, booking_group_id, guest_name, guest_email, guest_phone,
      status, payment_status, payment_method, total_price, discount_amount, source,
      id_document, id_document_type, local_discount
    ) values (
      _schedule_id, auth.uid(), v_group, v_names[i], v_email, v_phone,
      'confirmed', 'pending', 'cash',
      case when i = 1 then greatest(v_price - v_disc, 0) else v_price end,
      case when i = 1 then v_disc else 0 end,
      'online',
      case when i = 1 then v_doc end,
      case when i = 1 then v_doc_type end,
      i = 1 and v_local
    ) returning id into v_id;
    if i = 1 then v_first := v_id; end if;
    v_total := v_total + case when i = 1 then greatest(v_price - v_disc, 0) else v_price end;
  end loop;

  v_teacher := coalesce(nullif(btrim(s.instructor), ''), nullif(btrim(s.class_instructor), ''));
  return jsonb_build_object(
    'ok', true, 'booking_id', v_first, 'spots', v_count,
    'amount', v_total, 'teacher', v_teacher,
    'local_discount', v_local, 'discount', v_disc
  );
end $function$;

revoke all on function public.book_class_pay_cash(uuid, text, text, text, text[], text, text) from public;
grant execute on function public.book_class_pay_cash(uuid, text, text, text, text[], text, text) to anon, authenticated;

commit;
