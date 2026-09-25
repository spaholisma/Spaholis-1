-- Private classes are the teacher's: what she offers privately, and her prices.
--
-- Until now every private class cost the same studio prices (Admin → Services →
-- Private Classes) whoever taught it. A teacher now lists her own private
-- classes in her Teacher Panel — usually one of the classes she teaches, or
-- something she only teaches privately — each with her own prices:
--
--   price_one    one person                 (the "one-on-one" request)
--   price_two    two people                 (the "couple's" request)
--   price_group  a group of up to four      (the "group" request)
--   price_extra  each person beyond four    (empty: her groups stop at four)
--
-- A price left empty means she does not offer that kind (no aerial groups, say).
-- The website shows them on her class pages and in the request form, and the
-- price of a request is always worked out here, from what she saved — never
-- taken from the browser.

-- ── 1. Her private classes ──────────────────────────────────────────────────
create table if not exists public.teacher_private_offerings (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete set null,
  title            text not null check (length(btrim(title)) between 2 and 120),
  description      text check (description is null or length(description) <= 1000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 15 and 480),
  price_one        numeric(10,2) check (price_one   is null or price_one   >= 0),
  price_two        numeric(10,2) check (price_two   is null or price_two   >= 0),
  price_group      numeric(10,2) check (price_group is null or price_group >= 0),
  price_extra      numeric(10,2) check (price_extra is null or price_extra >= 0),
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint teacher_private_offerings_some_price
    check (price_one is not null or price_two is not null or price_group is not null)
);

create index if not exists teacher_private_offerings_teacher_idx
  on public.teacher_private_offerings (teacher_id, sort_order);

alter table public.teacher_private_offerings enable row level security;
grant select, insert, update, delete on public.teacher_private_offerings to authenticated;

-- She manages her own; nobody else's.
drop policy if exists tpo_teacher_rw on public.teacher_private_offerings;
create policy tpo_teacher_rw on public.teacher_private_offerings
  for all to authenticated
  using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

drop policy if exists tpo_admin_all on public.teacher_private_offerings;
create policy tpo_admin_all on public.teacher_private_offerings
  for all to authenticated
  using (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'))
  with check (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'));

create or replace function public.teacher_private_offerings_touch()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_teacher_private_offerings_touch on public.teacher_private_offerings;
create trigger trg_teacher_private_offerings_touch
  before update on public.teacher_private_offerings
  for each row execute function public.teacher_private_offerings_touch();

-- ── 2. What the website shows ───────────────────────────────────────────────
-- Active private classes of active teachers, for everyone.
create or replace function public.public_private_offerings()
returns table (
  id uuid, teacher_id uuid, teacher_name text, teacher_photo text,
  class_id uuid, title text, description text, duration_minutes integer,
  price_one numeric, price_two numeric, price_group numeric, price_extra numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select o.id, t.id, t.display_name, t.photo_url,
         o.class_id, o.title, o.description, o.duration_minutes,
         o.price_one, o.price_two, o.price_group, o.price_extra
    from public.teacher_private_offerings o
    join public.teachers t on t.id = o.teacher_id
   where o.active and t.active
   order by t.display_name, o.sort_order, o.title
$fn$;

revoke all on function public.public_private_offerings() from public;
grant execute on function public.public_private_offerings() to anon, authenticated;

-- ── 3. The price of a request, from her prices ───────────────────────────────
-- Null when she does not offer that kind (or not for that many people), or the
-- class or the teacher is no longer active.
create or replace function public.private_offering_price(_offering_id uuid, _kind text, _people integer)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case _kind
           when 'oneOnOne' then o.price_one
           when 'couples'  then o.price_two
           when 'group' then
             case
               when o.price_group is null or coalesce(_people, 0) < 1 then null
               when _people <= 4 then o.price_group
               when o.price_extra is null then null
               else o.price_group + (_people - 4) * o.price_extra
             end
         end
    from public.teacher_private_offerings o
    join public.teachers t on t.id = o.teacher_id
   where o.id = _offering_id and o.active and t.active
$fn$;

revoke all on function public.private_offering_price(uuid, text, integer) from public;
grant execute on function public.private_offering_price(uuid, text, integer) to anon, authenticated;

-- ── 4. Her requests show the price she quoted ───────────────────────────────
-- Same as 20260917120000, plus `quoted_price` — worked out from her offering,
-- not from anything the guest's browser wrote. The return type changes, so it
-- is dropped and made anew.
drop function if exists public.teacher_private_class_requests();

create function public.teacher_private_class_requests()
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
  note text,
  quoted_price numeric
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
         s.note,
         case when (b.intake_form->'private_class'->>'offering_id') ~* '^[0-9a-f-]{36}$'
              then public.private_offering_price(
                     (b.intake_form->'private_class'->>'offering_id')::uuid,
                     b.intake_form->'private_class'->>'kind',
                     nullif(b.intake_form->'private_class'->>'people', '')::int)
         end
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
