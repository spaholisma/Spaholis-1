-- Private classes on the teachers' calendar, and her real price on requests.
--
-- 1. The private-class email function (service_role) could not run
--    private_offering_price(), so every email said "Price: to be confirmed"
--    even when the teacher has a price. Granted here.
-- 2. When a teacher has agreed a private class with the guest, she puts it on
--    the calendar from the request. These sessions live in their own table and
--    are shown ONLY on the teachers' calendar (Teacher Panel → Calendar) — never
--    on the public schedule, and they take no class bookings. Other teachers see
--    the slot as "Private class · her name", without the guest's details.
-- 3. The requests list shows her price after the local discount / her coupon,
--    the guest's ID, and the date it is on her calendar.
--
-- Additive: one new table, new functions, one function widened. Rollback at the bottom.

-- 1 ────────────────────────────────────────────────────────────────────────────
grant execute on function public.private_offering_price(uuid, text, integer) to service_role;

-- 2 ────────────────────────────────────────────────────────────────────────────
create table if not exists public.teacher_private_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  -- The request it came from (bookings.id with intake_form.private_class).
  booking_id uuid unique references public.bookings(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  location text,
  guest_name text,
  people integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teacher_private_sessions_starts_idx on public.teacher_private_sessions (starts_at);

alter table public.teacher_private_sessions enable row level security;
-- Nobody reads or writes the table directly from the website: everything goes
-- through the functions below. The team can look at it.
drop policy if exists tps_admin_read on public.teacher_private_sessions;
create policy tps_admin_read on public.teacher_private_sessions
  for select using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'));
revoke all on public.teacher_private_sessions from anon, authenticated;
grant select on public.teacher_private_sessions to authenticated;

-- Put a private class (from one of her requests) on the calendar, or move it.
create or replace function public.teacher_schedule_private_class(
  _booking_id uuid, _starts_at timestamptz, _duration_minutes integer, _title text, _location text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  v_booking record;
  v_id uuid;
begin
  if v_teacher is null then
    raise exception 'Not a teacher' using errcode = '42501';
  end if;
  select b.id, b.guest_name, b.intake_form->'private_class' as pc into v_booking
  from public.bookings b join public.teachers t on t.id = v_teacher
  where b.id = _booking_id
    and b.intake_form ? 'private_class'
    and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name);
  if not found then
    raise exception 'Not your request' using errcode = '42501';
  end if;
  if _starts_at is null then raise exception 'Choose the day and time'; end if;
  if coalesce(_duration_minutes, 0) < 15 or _duration_minutes > 480 then
    raise exception 'The length must be between 15 minutes and 8 hours';
  end if;

  insert into public.teacher_private_sessions
    (teacher_id, booking_id, title, starts_at, duration_minutes, location, guest_name, people)
  values (
    v_teacher, _booking_id,
    coalesce(nullif(btrim(_title), ''), 'Private class'),
    _starts_at, _duration_minutes,
    nullif(btrim(coalesce(_location, '')), ''),
    v_booking.guest_name,
    nullif(v_booking.pc->>'people', '')::int
  )
  on conflict (booking_id) do update
    set starts_at = excluded.starts_at,
        duration_minutes = excluded.duration_minutes,
        title = excluded.title,
        location = excluded.location,
        updated_at = now()
  returning id into v_id;

  -- On the calendar = scheduled (her note stays).
  insert into public.private_class_teacher_status (booking_id, teacher_id, status, updated_at)
  values (_booking_id, v_teacher, 'scheduled', now())
  on conflict (booking_id) do update set status = 'scheduled', updated_at = now();

  return v_id;
end $$;

-- Take it off the calendar (only her own).
create or replace function public.teacher_remove_private_session(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_teacher uuid := public.current_teacher_id();
begin
  if v_teacher is null then
    raise exception 'Not a teacher' using errcode = '42501';
  end if;
  delete from public.teacher_private_sessions where id = _id and teacher_id = v_teacher;
  if not found then raise exception 'Not your private class' using errcode = '42501'; end if;
end $$;

-- What the teachers' calendar shows: her own private classes in full, and the
-- other teachers' only as a busy slot.
create or replace function public.teacher_calendar_private_sessions(_from timestamptz, _to timestamptz)
returns table(
  id uuid, teacher_name text, starts_at timestamptz, duration_minutes integer,
  title text, location text, guest_name text, people integer, mine boolean, booking_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id, t.display_name, s.starts_at, s.duration_minutes,
         case when s.teacher_id = public.current_teacher_id() then s.title else 'Private class' end,
         s.location,
         case when s.teacher_id = public.current_teacher_id() then s.guest_name end,
         case when s.teacher_id = public.current_teacher_id() then s.people end,
         s.teacher_id = public.current_teacher_id(),
         case when s.teacher_id = public.current_teacher_id() then s.booking_id end
  from public.teacher_private_sessions s
  join public.teachers t on t.id = s.teacher_id
  where public.current_teacher_id() is not null
    and s.starts_at >= _from and s.starts_at < _to
  order by s.starts_at
$$;

revoke all on function public.teacher_schedule_private_class(uuid, timestamptz, integer, text, text) from public, anon;
revoke all on function public.teacher_remove_private_session(uuid) from public, anon;
revoke all on function public.teacher_calendar_private_sessions(timestamptz, timestamptz) from public, anon;
grant execute on function public.teacher_schedule_private_class(uuid, timestamptz, integer, text, text) to authenticated;
grant execute on function public.teacher_remove_private_session(uuid) to authenticated;
grant execute on function public.teacher_calendar_private_sessions(timestamptz, timestamptz) to authenticated;

-- 3 ────────────────────────────────────────────────────────────────────────────
-- Same rows as before, plus: her price after the local discount or her coupon
-- (quoted_price), the price before it (list_price), the guest's ID and coupon,
-- and when it is on her calendar.
drop function if exists public.teacher_private_class_requests();
create function public.teacher_private_class_requests()
returns table(
  booking_id uuid, created_at timestamptz, guest_name text, guest_email text, guest_phone text,
  kind_title text, people integer, class_title text, preferred text, status text, note text,
  quoted_price numeric, location_label text, location_address text,
  list_price numeric, local_discount boolean, coupon_code text,
  id_document text, id_document_type text,
  session_id uuid, session_starts_at timestamptz, session_minutes integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with r as (
    select b.*, t.id as tid,
           b.intake_form->'private_class' as pc,
           case when (b.intake_form->'private_class'->>'offering_id') ~* '^[0-9a-f-]{36}$'
                then public.private_offering_price(
                       (b.intake_form->'private_class'->>'offering_id')::uuid,
                       b.intake_form->'private_class'->>'kind',
                       nullif(b.intake_form->'private_class'->>'people', '')::int)
           end as base
    from public.bookings b
    join public.teachers t on t.id = public.current_teacher_id()
    where b.intake_form ? 'private_class'
      and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)
  ), q as (
    select r.*,
           case when r.base is not null then public.teacher_price(
             r.tid, r.base,
             case when r.pc->>'id_document_type' = 'cr_cedula' then r.pc->>'id_document' end,
             r.pc->>'coupon_code') end as quote
    from r
  )
  select q.id, q.created_at, q.guest_name, q.guest_email, q.guest_phone,
         q.pc->>'kind_title',
         nullif(q.pc->>'people', '')::int,
         q.pc->>'class_title',
         q.pc->>'preferred',
         coalesce(s.status, 'new'),
         s.note,
         coalesce((q.quote->>'price')::numeric, q.base),
         q.pc->>'location_label',
         left(q.pc->>'location_address', 300),
         q.base,
         coalesce((q.quote->>'local')::boolean, false),
         case when q.quote->>'coupon_status' = 'applied' then q.quote->>'coupon' end,
         left(q.pc->>'id_document', 30),
         q.pc->>'id_document_type',
         ps.id, ps.starts_at, ps.duration_minutes
  from q
  left join public.private_class_teacher_status s on s.booking_id = q.id and s.teacher_id = q.tid
  left join public.teacher_private_sessions ps on ps.booking_id = q.id
  order by q.created_at desc
  limit 200
$$;
revoke all on function public.teacher_private_class_requests() from public, anon;
grant execute on function public.teacher_private_class_requests() to authenticated;

-- Rollback (by hand):
--   drop function if exists public.teacher_calendar_private_sessions(timestamptz, timestamptz);
--   drop function if exists public.teacher_remove_private_session(uuid);
--   drop function if exists public.teacher_schedule_private_class(uuid, timestamptz, integer, text, text);
--   drop table if exists public.teacher_private_sessions;
--   -- teacher_private_class_requests: re-create the previous version (14 columns, no session/ID).
--   revoke execute on function public.private_offering_price(uuid, text, integer) from service_role;
