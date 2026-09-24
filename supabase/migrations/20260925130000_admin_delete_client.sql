-- Clients: delete a client altogether.
--
-- A test person entered at the desk ("Eve Prueba") had no website login, so
-- there was nothing to delete: their pass and bookings kept them on the list
-- for good. This removes a client and everything that is theirs.
--
--   · treatments go to the Appointments Trash (restorable for 30 days), the
--     same way the calendar deletes one
--   · classes are removed; a class paid with a pass gives its credit back and
--     the spot opens up again, as when the admin deletes an attendee
--   · memberships and passes are removed with their redemptions
--   · calendar entries with their name on them are removed
--
-- A client with a website login keeps it until the Admin deletes the login
-- first (the `admin-clients` function); staff are never deleted from here.
--
-- Teachers are emailed when a student leaves one of their classes. For a class
-- still to come that is right — a spot opened. For classes that already
-- happened it is noise, and a correction of a client's name or phone on every
-- booking they ever made is noise too. `holis.quiet_teacher_notify`, set for
-- the length of one admin action, keeps those quiet.

-- ── 1. A quiet switch for the teacher notifications ───────────────────────
-- The body is unchanged apart from the first line after `begin`.
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
    v_event := case when coalesce(new.source,'') = 'teacher' then 'student_added' else 'booking_created' end;
    v_sched := new.schedule_id;
    v_name  := new.guest_name;

  elsif tg_op = 'DELETE' then
    v_event := 'student_removed';
    v_sched := old.schedule_id;
    v_name  := old.guest_name;

  else -- UPDATE on class_bookings
    v_sched := new.schedule_id;
    v_name  := new.guest_name;
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
      'studentName', v_name, 'previousTeacher', v_prev)
  );

  return coalesce(new, old);
exception when others then
  raise warning 'notify_teacher_event failed: %', sqlerrm;
  return coalesce(new, old);
end $function$;

-- ── 2. Correcting a client's details does not email their teachers ────────
-- Same function as 20260925120000, with the quiet switch around the updates.
create or replace function public.admin_update_client_contact(
  _key   text,
  _name  text,
  _email text,
  _phone text default null,
  _user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name  text := nullif(btrim(coalesce(_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(_phone, '')), '');
  v_memberships uuid[];
  v_classes     uuid[];
  v_treatments  uuid[];
  v_calendar    uuid[];
  v_user        uuid;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;
  if v_name is null then raise exception 'The client''s name is required'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right';
  end if;

  select array_agg(ref_id) filter (where kind = 'membership'),
         array_agg(ref_id) filter (where kind = 'class'),
         array_agg(ref_id) filter (where kind = 'treatment'),
         array_agg(ref_id) filter (where kind = 'calendar'),
         (array_agg(user_id) filter (where kind = 'account'))[1]
    into v_memberships, v_classes, v_treatments, v_calendar, v_user
    from public.client_events()
   where client_key = _key
      or (_user_id is not null and user_id = _user_id
          and client_key = public.client_key(v_email, v_phone, v_name));

  if v_memberships is null and v_classes is null and v_treatments is null
     and v_calendar is null and v_user is null then
    raise exception 'Client not found';
  end if;

  perform set_config('holis.quiet_teacher_notify', 'on', true);

  update public.user_offerings
     set guest_name = v_name, guest_email = v_email, guest_phone = v_phone
   where id = any(coalesce(v_memberships, '{}'));

  update public.class_bookings
     set guest_name = v_name, guest_email = v_email, guest_phone = v_phone
   where id = any(coalesce(v_classes, '{}'));

  update public.bookings
     set guest_name = v_name, guest_email = v_email, guest_phone = v_phone
   where id = any(coalesce(v_treatments, '{}'));

  update public.admin_calendar_entries
     set client_name = v_name, client_email = v_email
   where id = any(coalesce(v_calendar, '{}'));

  if v_user is not null then
    update public.profiles set full_name = v_name, phone = v_phone where user_id = v_user;
  end if;

  perform set_config('holis.quiet_teacher_notify', 'off', true);

  return jsonb_build_object('client_key', public.client_key(v_email, v_phone, v_name));
end;
$fn$;

-- ── 3. Delete a client and everything that is theirs ──────────────────────
create or replace function public.admin_delete_client(_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_memberships uuid[];
  v_classes     uuid[];
  v_treatments  uuid[];
  v_calendar    uuid[];
  v_user        uuid;
  v_id          uuid;
  n_upcoming int := 0; n_past int := 0; n_off int := 0; n_trt int := 0; n_cal int := 0;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(coalesce(_key, '')), '') is null then raise exception 'Client not found'; end if;

  select array_agg(ref_id) filter (where kind = 'membership'),
         array_agg(ref_id) filter (where kind = 'class'),
         array_agg(ref_id) filter (where kind = 'treatment'),
         array_agg(ref_id) filter (where kind = 'calendar'),
         (array_agg(user_id) filter (where kind = 'account'))[1]
    into v_memberships, v_classes, v_treatments, v_calendar, v_user
    from public.client_events() where client_key = _key;

  if v_user is not null then
    if exists (select 1 from public.user_roles where user_id = v_user)
       or exists (select 1 from public.teachers where user_id = v_user) then
      raise exception 'This is a staff account — it cannot be changed from Clients';
    end if;
    raise exception 'This client has a website account — delete the account first';
  end if;

  if v_memberships is null and v_classes is null and v_treatments is null and v_calendar is null then
    raise exception 'Client not found';
  end if;

  -- Classes still to come: the teacher hears that a spot opened up.
  delete from public.class_bookings cb
   using public.class_schedule cs
   where cb.id = any(coalesce(v_classes, '{}'))
     and cs.id = cb.schedule_id
     and cs.start_time > now();
  get diagnostics n_upcoming = row_count;

  -- Everything else happens quietly.
  perform set_config('holis.quiet_teacher_notify', 'on', true);

  delete from public.class_bookings where id = any(coalesce(v_classes, '{}'));
  get diagnostics n_past = row_count;

  -- Their redemptions go with them (on delete cascade).
  delete from public.user_offerings where id = any(coalesce(v_memberships, '{}'));
  get diagnostics n_off = row_count;

  -- Treatments go to the Trash, restorable for 30 days.
  foreach v_id in array coalesce(v_treatments, '{}') loop
    perform public.soft_delete_booking(v_id);
    n_trt := n_trt + 1;
  end loop;

  delete from public.admin_calendar_entries where id = any(coalesce(v_calendar, '{}'));
  get diagnostics n_cal = row_count;

  perform set_config('holis.quiet_teacher_notify', 'off', true);

  return jsonb_build_object(
    'memberships', n_off,
    'classes', n_upcoming + n_past,
    'treatments', n_trt,
    'calendar', n_cal
  );
end;
$fn$;

comment on function public.admin_delete_client(text) is
  'Admin: delete a client without a website account and everything that is theirs (treatments go to the Trash).';

revoke all on function public.admin_delete_client(text) from public, anon;
grant execute on function public.admin_delete_client(text) to authenticated;
