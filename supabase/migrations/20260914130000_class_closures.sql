-- Closed days for classes.
--
-- The studio closes on specific days (all of October, for one). An admin lists
-- those days in the Classes calendar; on them nobody can book or join a class,
-- whichever way they try, and no session can be scheduled.
--
-- One row per closed day, dated in Costa Rica time. The public reads the list
-- so the website can hide those days; only admins change it.
--
-- Enforcement lives here rather than in each screen because a class booking is
-- created by at least seven paths: the website's own insert, a membership
-- token, an admin order, create-class-booking, finalize-class-booking, PayPal
-- capture and the teacher panel. One trigger covers every one of them.

create table if not exists public.class_closures (
  id uuid primary key default gen_random_uuid(),
  closed_date date not null unique,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

comment on table public.class_closures is
  'Days the studio is closed for classes (Costa Rica dates). No class can be booked or scheduled on them.';

alter table public.class_closures enable row level security;

drop policy if exists "Anyone can read class closures" on public.class_closures;
create policy "Anyone can read class closures"
  on public.class_closures for select
  using (true);

drop policy if exists "Admins manage class closures" on public.class_closures;
create policy "Admins manage class closures"
  on public.class_closures for all
  to authenticated
  using (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'))
  with check (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'));

-- PostgREST needs the grant on top of RLS.
grant select on public.class_closures to anon, authenticated;
grant insert, update, delete on public.class_closures to authenticated;

-- Is the studio closed for classes on the Costa Rica date of this instant?
create or replace function public.is_class_day_closed(_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_closures c
    where c.closed_date = (_at at time zone 'America/Costa_Rica')::date
  );
$$;

grant execute on function public.is_class_day_closed(timestamptz) to anon, authenticated;

-- No booking for a class on a closed day, by any path.
create or replace function public.class_bookings_block_closed_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  select start_time into v_start from public.class_schedule where id = new.schedule_id;
  if v_start is not null and public.is_class_day_closed(v_start) then
    raise exception 'The studio is closed on this day — this class cannot be booked.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists class_bookings_block_closed_days on public.class_bookings;
create trigger class_bookings_block_closed_days
  before insert on public.class_bookings
  for each row execute function public.class_bookings_block_closed_days();

-- No session scheduled on, or moved onto, a closed day.
create or replace function public.class_schedule_block_closed_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.start_time is not distinct from old.start_time then
    return new;
  end if;
  if new.start_time is not null and public.is_class_day_closed(new.start_time) then
    raise exception 'The studio is closed for classes on %. Remove it from Closed days first.',
      to_char(new.start_time at time zone 'America/Costa_Rica', 'FMDay, FMMonth FMDD')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists class_schedule_block_closed_days on public.class_schedule;
create trigger class_schedule_block_closed_days
  before insert or update of start_time on public.class_schedule
  for each row execute function public.class_schedule_block_closed_days();

revoke all on function public.class_bookings_block_closed_days() from public, anon, authenticated;
revoke all on function public.class_schedule_block_closed_days() from public, anon, authenticated;
