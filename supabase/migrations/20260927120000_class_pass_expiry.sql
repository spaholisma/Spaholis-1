-- Class passes expire, as their welcome emails already say.
--
-- The 5-Class Pass email says "5 classes valid for 30 days" and the 10-Class
-- Pass email "10 classes valid for 60 days", but no pass was ever given an
-- expiry date, so none ever expired. Everything else was already in place:
-- booking with a pass (book_class_with_offering, book_class_with_membership_token)
-- refuses one whose expires_at has passed, and the daily send-expiry-notices
-- job marks it expired and emails the customer.
--
--   1. The two passes get their validity (offerings.duration_days).
--   2. Every new pass or membership gets its expiry date from its offering the
--      moment it is created — whichever screen or function creates it (the
--      Admin, PayPal, an online purchase, a teacher's order) — unless it
--      already brings one. Same rule as memberships: a whole number of months
--      counts calendar months (Jul 28 + 60 days → Sep 28), otherwise days.
--   3. The passes already sold get the date they would have had, counted from
--      when they started. None of the active ones is past it today.
--
-- The drop-in's email names no validity, so it keeps none.

-- ── 1. How long each pass lasts ────────────────────────────────────────────
update public.offerings set duration_days = 30
 where id = '61cb7970-a41f-4f75-ae76-a4eabf138c6f' and type = 'class_pass' and duration_days is null;  -- 5-Class Pass
update public.offerings set duration_days = 60
 where id = '36a8b555-b849-405b-9851-469cc6c151b9' and type = 'class_pass' and duration_days is null;  -- 10-Class Pass

-- ── 2. The expiry rule, in one place ───────────────────────────────────────
create or replace function public.offering_expiry(_from timestamptz, _days integer)
returns timestamptz
language sql
immutable
as $fn$
  select case
    when _days is null or _days <= 0 then null
    when _days % 30 = 0 then _from + make_interval(months => _days / 30)
    else _from + make_interval(days => _days)
  end;
$fn$;

comment on function public.offering_expiry(timestamptz, integer) is
  'When something that lasts _days from _from expires: whole months count as calendar months, like memberships.';

create or replace function public.set_user_offering_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_days integer;
begin
  if new.expires_at is null and new.offering_id is not null then
    select duration_days into v_days from public.offerings where id = new.offering_id;
    new.expires_at := public.offering_expiry(coalesce(new.starts_at, now()), v_days);
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_user_offerings_set_expiry on public.user_offerings;
create trigger trg_user_offerings_set_expiry
  before insert on public.user_offerings
  for each row execute function public.set_user_offering_expiry();

-- ── 3. Passes already sold ─────────────────────────────────────────────────
-- Active, used-up and frozen ones get their date; cancelled ones are left be.
-- A used-up pass already past its date is marked as notified, so the daily job
-- does not email "your pass has expired" about a pass with nothing left on it.
with dated as (
  select uo.id,
         public.offering_expiry(coalesce(uo.starts_at, uo.created_at), o.duration_days) as expiry
    from public.user_offerings uo
    join public.offerings o on o.id = uo.offering_id
   where uo.expires_at is null
     and uo.status in ('active', 'depleted', 'frozen')
     and o.type = 'class_pass'
     and o.duration_days is not null
)
update public.user_offerings uo
   set expires_at = d.expiry,
       expiry_notified_at = case
         when uo.status = 'depleted' and d.expiry < now() then coalesce(uo.expiry_notified_at, now())
         else uo.expiry_notified_at
       end
  from dated d
 where uo.id = d.id and d.expiry is not null;
