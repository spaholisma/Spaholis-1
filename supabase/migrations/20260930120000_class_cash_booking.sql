-- Classes: book now, pay in cash at the class.
--
-- Under the studio-rental model the teacher collects her own money, so a guest
-- may reserve a paid class online and pay her in cash when they arrive. The
-- booking is made HERE, not by the browser: the price comes from the class, the
-- phone is required (it tells us whether they are visiting or local), and the
-- usual rules hold — the class must be open, not started, not full, not on a
-- closed day.
--
-- The booking is stored the way the team already records cash that is still
-- owed from the Admin: payment_method 'cash', payment_status 'pending'. The
-- Admin calendar and the Teacher Panel both read it as "to collect".
create or replace function public.book_class_pay_cash(
  _schedule_id uuid,
  _guest_name text,
  _guest_email text,
  _guest_phone text,
  _participant_names text[] default null
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

  if v_count > 1 then v_group := gen_random_uuid(); end if;
  for i in 1 .. v_count loop
    insert into public.class_bookings (
      schedule_id, user_id, booking_group_id, guest_name, guest_email, guest_phone,
      status, payment_status, payment_method, total_price, discount_amount, source
    ) values (
      _schedule_id, auth.uid(), v_group, v_names[i], v_email, v_phone,
      'confirmed', 'pending', 'cash', v_price, 0, 'online'
    ) returning id into v_id;
    if i = 1 then v_first := v_id; end if;
  end loop;

  v_teacher := coalesce(nullif(btrim(s.instructor), ''), nullif(btrim(s.class_instructor), ''));
  return jsonb_build_object(
    'ok', true, 'booking_id', v_first, 'spots', v_count,
    'amount', v_price * v_count, 'teacher', v_teacher
  );
end $function$;

revoke all on function public.book_class_pay_cash(uuid, text, text, text, text[]) from public;
grant execute on function public.book_class_pay_cash(uuid, text, text, text, text[]) to anon, authenticated;

-- The teacher's "new signup" email says when the student pays her in cash, so
-- it needs to know which booking it is about: the payload now carries its id.
-- Everything else is exactly as before.
create or replace function public.notify_teacher_event()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_event   text;
  v_sched   uuid;
  v_name    text;
  v_prev    text;
  v_booking uuid;
  v_secret  text;
  v_ok      text[] := array['booked','confirmed','completed','paid'];
begin
  if coalesce(current_setting('holis.quiet_teacher_notify', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'class_schedule' then
    if pg_trigger_depth() > 1 then return new; end if;

    v_sched := new.id;
    if new.is_cancelled is distinct from old.is_cancelled then
      v_event := case when new.is_cancelled then 'class_cancelled' else 'class_reactivated' end;
    elsif new.start_time is distinct from old.start_time then
      v_event := 'class_rescheduled';
    elsif lower(btrim(coalesce(new.instructor,''))) is distinct from lower(btrim(coalesce(old.instructor,''))) then
      v_event := 'class_reassigned';
      v_prev  := nullif(btrim(coalesce(old.instructor,'')), '');
    else
      return new;
    end if;

  elsif tg_op = 'INSERT' then
    if not (new.status = any(v_ok)) then return new; end if;
    v_event   := case when coalesce(new.source,'') = 'teacher' then 'student_added' else 'booking_created' end;
    v_sched   := new.schedule_id;
    v_name    := new.guest_name;
    v_booking := new.id;

  elsif tg_op = 'DELETE' then
    v_event := 'student_removed';
    v_sched := old.schedule_id;
    v_name  := old.guest_name;

  else -- UPDATE on class_bookings
    v_sched   := new.schedule_id;
    v_name    := new.guest_name;
    v_booking := new.id;
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      v_event := 'booking_cancelled';
    elsif new.status = any(v_ok) and not (old.status = any(v_ok)) then
      v_event := 'booking_created';
    elsif (new.guest_name, new.guest_email, new.guest_phone, new.client_type)
          is distinct from (old.guest_name, old.guest_email, old.guest_phone, old.client_type) then
      v_event := 'student_updated';
    else
      return new;
    end if;
  end if;

  select value into v_secret from public.internal_secrets where name = 'notify_teacher';
  if v_secret is null then return coalesce(new, old); end if;

  perform net.http_post(
    url     := 'https://zhdqjtgtolnksiaepxbd.supabase.co/functions/v1/notify-teacher',
    headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', v_secret),
    body    := jsonb_build_object(
      'event', v_event, 'scheduleId', v_sched,
      'studentName', v_name, 'previousTeacher', v_prev, 'bookingId', v_booking)
  );

  return coalesce(new, old);
exception when others then
  raise warning 'notify_teacher_event failed: %', sqlerrm;
  return coalesce(new, old);
end $function$;
