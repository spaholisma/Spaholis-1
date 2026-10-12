-- Cancellations by a teacher reach everyone: the students, the teacher and Holis.
--
-- 1. A class she cancels carries her reason (class_schedule.cancel_reason), and
--    a class paid with a pass goes back on the pass at once (refund_class_credit
--    is idempotent: it only returns what offering_redemptions recorded).
-- 2. Removing a student goes through teacher_remove_class_student(): a reason is
--    required and she chooses whether the student is emailed. The booking is
--    gone by the time the email is written, so the trigger sends its details.
-- 3. She can cancel a private class with a reason
--    (teacher_cancel_private_class): off her calendar, marked cancelled, and
--    the guest, she and Holis are emailed.
-- 4. The emails to the student/guest and to Holis are editable in
--    Admin → Client Emails ("Class changes by teachers" and "Team notifications").
--
-- Additive: one column, one trigger, two functions, notify_teacher_event()
-- widened (same events as before; the removal and cancellation carry more
-- data), six email templates. Rollback at the bottom.

-- 1 ────────────────────────────────────────────────────────────────────────────
alter table public.class_schedule add column if not exists cancel_reason text;

create or replace function public.class_schedule_cancel_refunds()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_cancelled and not coalesce(old.is_cancelled, false) then
    perform public.refund_class_credit(b.id, b.user_offering_id)
    from public.class_bookings b
    where b.schedule_id = new.id
      and b.status <> 'cancelled'
      and b.user_offering_id is not null;
  end if;
  return new;
end $$;

drop trigger if exists trg_class_schedule_cancel_refunds on public.class_schedule;
create trigger trg_class_schedule_cancel_refunds
  after update of is_cancelled on public.class_schedule
  for each row execute function public.class_schedule_cancel_refunds();

-- 2 ────────────────────────────────────────────────────────────────────────────
create or replace function public.teacher_remove_class_student(
  _booking_id uuid, _reason text, _notify_student boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_schedule uuid;
  v_reason text := left(btrim(coalesce(_reason, '')), 500);
begin
  select schedule_id into v_schedule from public.class_bookings where id = _booking_id;
  if not found then raise exception 'That student is no longer on the list'; end if;
  if not (public.is_own_class_session(v_schedule)
          or public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager')) then
    raise exception 'Not your class' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'Please write the reason'; end if;

  -- Read by notify_teacher_event() for this delete only (local to the transaction).
  perform set_config('holis.remove_reason', v_reason, true);
  perform set_config('holis.remove_notify', case when coalesce(_notify_student, true) then 'on' else 'off' end, true);
  perform set_config('holis.remove_by_teacher', 'on', true);
  delete from public.class_bookings where id = _booking_id;
  perform set_config('holis.remove_by_teacher', 'off', true);
end $$;

revoke all on function public.teacher_remove_class_student(uuid, text, boolean) from public, anon;
grant execute on function public.teacher_remove_class_student(uuid, text, boolean) to authenticated;

-- The trigger behind every teacher email. Same events as before; a removal now
-- carries the student's details and the reason, a cancellation its reason.
create or replace function public.notify_teacher_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event   text;
  v_sched   uuid;
  v_name    text;
  v_prev    text;
  v_booking uuid;
  v_secret  text;
  v_extra   jsonb := '{}'::jsonb;
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
      if new.is_cancelled then
        v_extra := jsonb_build_object('reason', nullif(btrim(coalesce(new.cancel_reason, '')), ''));
      end if;
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
    -- The row is gone when the email is written: send what it said.
    v_extra := jsonb_build_object(
      'removed', jsonb_build_object(
        'name', old.guest_name, 'email', old.guest_email, 'phone', old.guest_phone,
        'status', old.status, 'payment_method', old.payment_method, 'payment_status', old.payment_status,
        'total_price', old.total_price, 'coupon_code', old.coupon_code,
        'pass', old.user_offering_id is not null),
      'reason', nullif(current_setting('holis.remove_reason', true), ''),
      'notifyStudent', coalesce(current_setting('holis.remove_notify', true), '') = 'on',
      'byTeacher', coalesce(current_setting('holis.remove_by_teacher', true), '') = 'on');

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
      'studentName', v_name, 'previousTeacher', v_prev, 'bookingId', v_booking) || v_extra
  );

  return coalesce(new, old);
exception when others then
  raise warning 'notify_teacher_event failed: %', sqlerrm;
  return coalesce(new, old);
end $$;

-- 3 ────────────────────────────────────────────────────────────────────────────
create or replace function public.teacher_cancel_private_class(_booking_id uuid, _reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  v_reason text := left(btrim(coalesce(_reason, '')), 500);
  v_title text;
  v_starts timestamptz;
  v_minutes integer;
  v_location text;
  v_secret text;
begin
  if v_teacher is null then
    raise exception 'Not a teacher' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.bookings b join public.teachers t on t.id = v_teacher
    where b.id = _booking_id
      and b.intake_form ? 'private_class'
      and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)
  ) then
    raise exception 'Not your request' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'Please write the reason'; end if;
  if exists (select 1 from public.private_class_teacher_status
             where booking_id = _booking_id and status = 'cancelled') then
    raise exception 'This private class is already cancelled';
  end if;

  -- Off her calendar (the email still says when it was).
  delete from public.teacher_private_sessions where booking_id = _booking_id
  returning title, starts_at, duration_minutes, location into v_title, v_starts, v_minutes, v_location;

  insert into public.private_class_teacher_status (booking_id, teacher_id, status, updated_at)
  values (_booking_id, v_teacher, 'cancelled', now())
  on conflict (booking_id) do update set status = 'cancelled', updated_at = now();

  select value into v_secret from public.internal_secrets where name = 'notify_teacher';
  if v_secret is not null then
    perform net.http_post(
      url     := 'https://zhdqjtgtolnksiaepxbd.supabase.co/functions/v1/notify-teacher',
      headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', v_secret),
      body    := jsonb_build_object(
        'event', 'private_class_cancelled', 'teacherId', v_teacher, 'bookingId', _booking_id,
        'reason', v_reason,
        'session', case when v_starts is not null then jsonb_build_object(
          'title', v_title, 'starts_at', v_starts,
          'minutes', v_minutes, 'location', v_location) end)
    );
  end if;
end $$;

revoke all on function public.teacher_cancel_private_class(uuid, text) from public, anon;
grant execute on function public.teacher_cancel_private_class(uuid, text) to authenticated;

-- 4 ────────────────────────────────────────────────────────────────────────────
insert into public.email_templates (template_key, label, category, description, subject, heading, body_html, enabled) values
(
  'class_cancelled_student', 'Class cancelled by the teacher', 'class_changes',
  'To each student signed up when a class is cancelled. {{reason}} is what the teacher wrote; {{payment_note}} says what happens to their payment (refund from Holis, class back on the pass, nothing to pay); {{details}} is the class table; {{button}} opens the class schedule.',
  'Cancelled: {{class_title}} — {{when}}',
  'Your class has been cancelled',
  '<p>Hi {{first_name}},</p>
<p>We are sorry — <strong>{{class_title}}</strong> on {{when}} with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>{{payment_note}}</p>
<p>You are welcome to choose another class on our schedule.</p>
{{button}}
<p class="fine" style="font-size:13px;color:#666;">Questions? Reply to this email or write to us on WhatsApp: +506 8814 6760.</p>',
  true
),
(
  'class_student_removed', 'Student removed from a class', 'class_changes',
  'To a student the teacher removed from a class, when she chose to email them. {{reason}} is what the teacher wrote; {{payment_note}} says what happens to their payment.',
  'Your spot in {{class_title}} — {{when}}',
  'Your booking has been cancelled',
  '<p>Hi {{first_name}},</p>
<p>Your spot in <strong>{{class_title}}</strong> on {{when}} with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>{{payment_note}}</p>
{{button}}
<p class="fine" style="font-size:13px;color:#666;">If you think this is a mistake, reply to this email or write to us on WhatsApp: +506 8814 6760.</p>',
  true
),
(
  'private_class_cancelled_guest', 'Private class cancelled by the teacher', 'class_changes',
  'To the guest when the teacher cancels their private class. {{reason}} is what the teacher wrote; {{details}} is the class, the teacher, the date and the place.',
  'Your private class with {{teacher_name}} has been cancelled',
  'Your private class has been cancelled',
  '<p>Hi {{first_name}},</p>
<p>We are sorry — your private class <strong>{{class_title}}</strong> with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>If you had already paid for it, Holis Wellness Center will contact you about your refund.</p>
<p>We would love to find you another date or another teacher — just reply to this email.</p>
<p class="fine" style="font-size:13px;color:#666;">WhatsApp: +506 8814 6760</p>',
  true
),
(
  'team_class_cancelled', 'Class cancelled by a teacher', 'team',
  'To the team when a class is cancelled. {{details}} is the class, the teacher and the reason; {{students}} lists everyone who was signed up, how they paid and what to do (refund, class already back on the pass, nothing).',
  '[Class cancelled] {{class_title}} — {{when}} ({{teacher_name}})',
  'Class cancelled',
  '{{details}}
<h3 style="font-size:15px;margin:20px 0 8px;">Students who were signed up</h3>
{{students}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">Each student has been emailed. Online payments to Holis need a refund; classes paid with a pass are already back on the pass.</p>',
  true
),
(
  'team_student_removed', 'Student removed by a teacher', 'team',
  'To the team when a teacher removes a student from her class. {{details}} is the class, the student, how they paid, the reason and whether the student was emailed.',
  '[Student removed] {{guest_name}} — {{class_title}} — {{when}}',
  'Student removed from a class',
  '{{details}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">{{student_notice}}</p>',
  true
),
(
  'team_private_class_cancelled', 'Private class cancelled by a teacher', 'team',
  'To the team when a teacher cancels a private class. {{details}} is the guest, the class, the date, the place and the reason.',
  '[Private class cancelled] {{guest_name}} — {{teacher_name}}',
  'Private class cancelled',
  '{{details}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">The guest has been emailed. If they paid anything, please arrange the refund.</p>',
  true
)
on conflict (template_key) do nothing;

-- Rollback (by hand):
--   drop function if exists public.teacher_cancel_private_class(uuid, text);
--   drop function if exists public.teacher_remove_class_student(uuid, text, boolean);
--   drop trigger if exists trg_class_schedule_cancel_refunds on public.class_schedule;
--   drop function if exists public.class_schedule_cancel_refunds();
--   alter table public.class_schedule drop column if exists cancel_reason;
--   notify_teacher_event(): re-create the version in 20260930120000_class_cash_booking.sql.
--   delete from public.email_templates where template_key in ('class_cancelled_student',
--     'class_student_removed', 'private_class_cancelled_guest', 'team_class_cancelled',
--     'team_student_removed', 'team_private_class_cancelled');
