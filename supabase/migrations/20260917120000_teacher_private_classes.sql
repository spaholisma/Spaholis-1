-- Private classes in the Teacher Panel.
--
-- A teacher sees the private class requests that named her — the ones the
-- website emailed her — and keeps her own status and note on each, so she can
-- track who she has already answered. Prices are not hers to change: they stay
-- in the Holis admin and she only reads them.
--
-- Bookings are not readable by teachers, and this does not change that: the
-- panel goes through two security-definer functions that only ever touch the
-- requests that name the teacher who is asking.

-- 0. Names are compared the way a person reads them: same letters, ignoring
--    capitals and any extra spaces, so "Zhijian  Chen " matches "Zhijian Chen".
create or replace function public.norm_name(_v text)
returns text
language sql
immutable
as $$ select nullif(lower(regexp_replace(btrim(coalesce(_v, '')), '\s+', ' ', 'g')), '') $$;

-- 1. Her own tracking of each request.
create table if not exists public.private_class_teacher_status (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  status text not null default 'new',
  note text,
  updated_at timestamptz not null default now()
);

alter table public.private_class_teacher_status enable row level security;
grant select, insert, update on public.private_class_teacher_status to authenticated;

drop policy if exists pcts_teacher_rw on public.private_class_teacher_status;
create policy pcts_teacher_rw on public.private_class_teacher_status
  for all to authenticated
  using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

drop policy if exists pcts_admin_all on public.private_class_teacher_status;
create policy pcts_admin_all on public.private_class_teacher_status
  for all to authenticated
  using (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'))
  with check (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'));

-- 2. What she offers privately, in her own words (she may edit it; nobody else
--    has to). Shown in her panel and useful for the team when they call her.
alter table public.teachers add column if not exists private_class_note text;

-- 3. The requests that named her. Only her own, only the fields she needs to
--    answer the guest.
create or replace function public.teacher_private_class_requests()
returns table (
  booking_id uuid,
  created_at timestamptz,
  guest_name text,
  guest_email text,
  guest_phone text,
  kind_title text,
  people integer,
  class_title text,
  preferred text,
  status text,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.created_at, b.guest_name, b.guest_email, b.guest_phone,
         b.intake_form->'private_class'->>'kind_title',
         nullif(b.intake_form->'private_class'->>'people', '')::int,
         b.intake_form->'private_class'->>'class_title',
         b.intake_form->'private_class'->>'preferred',
         coalesce(s.status, 'new'),
         s.note
  from public.bookings b
  join public.teachers t on t.id = public.current_teacher_id()
  left join public.private_class_teacher_status s
    on s.booking_id = b.id and s.teacher_id = t.id
  where b.intake_form ? 'private_class'
    and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)
  order by b.created_at desc
  limit 200
$$;

revoke all on function public.teacher_private_class_requests() from public, anon;
grant execute on function public.teacher_private_class_requests() to authenticated;

-- 4. What she may write back: a status and a note on a request that is hers.
create or replace function public.teacher_set_private_class_status(_booking_id uuid, _status text, _note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := public.current_teacher_id();
begin
  if v_teacher is null then
    raise exception 'Not a teacher' using errcode = '42501';
  end if;
  if _status not in ('new', 'replied', 'scheduled', 'declined') then
    raise exception 'Unknown status';
  end if;
  if not exists (
    select 1 from public.bookings b join public.teachers t on t.id = v_teacher
    where b.id = _booking_id
      and b.intake_form ? 'private_class'
      and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)
  ) then
    raise exception 'Not your request' using errcode = '42501';
  end if;

  insert into public.private_class_teacher_status (booking_id, teacher_id, status, note, updated_at)
  values (_booking_id, v_teacher, _status, nullif(btrim(coalesce(_note, '')), ''), now())
  on conflict (booking_id) do update
    set status = excluded.status, note = excluded.note, updated_at = now();
end;
$$;

revoke all on function public.teacher_set_private_class_status(uuid, text, text) from public, anon;
grant execute on function public.teacher_set_private_class_status(uuid, text, text) to authenticated;
