-- Every client, not just the ones with a website account.
--
-- Admin → Clients listed `profiles` only — people who signed up on
-- spaholis.com. Most of the studio's regulars never do: they come to class,
-- buy a pass at the desk, and are entered by hand. They were in the system
-- (their memberships, their class bookings, their treatments) but not in the
-- client list, and there was no single place to see everything about one.
--
-- These two functions read every place a person can appear and put it
-- together:
--
--   admin_client_directory()      one row per person, with what they have done
--   admin_client_history(_key)    everything about one person
--
-- A person is recognised by their email; without one, by their phone number;
-- without that, by their name. The same email across a website account, a
-- pass bought at the desk and a class booked by hand is one person.
--
-- Nothing is written. Both functions only read, and only for staff.

create or replace function public.client_key(_email text, _phone text, _name text)
returns text
language sql
immutable
as $fn$
  select case
    when nullif(lower(btrim(coalesce(_email, ''))), '') is not null
      then lower(btrim(_email))
    when length(regexp_replace(coalesce(_phone, ''), '\D', '', 'g')) >= 7
      then 'tel:' || regexp_replace(_phone, '\D', '', 'g')
    when nullif(btrim(coalesce(_name, '')), '') is not null
      then 'name:' || regexp_replace(lower(btrim(_name)), '\s+', ' ', 'g')
    else null
  end;
$fn$;

comment on function public.client_key(text, text, text) is
  'How a person is recognised across the system: email, else phone digits, else name.';

-- Every trace a person leaves, one row each. Shared by both functions below so
-- the list and the detail can never disagree about who is who.
create or replace function public.client_events()
returns table (
  client_key text,
  name       text,
  email      text,
  phone      text,
  user_id    uuid,
  happened   timestamptz,
  kind       text,      -- account | membership | class | treatment | calendar
  ref_id     uuid,
  amount     numeric,
  is_active  boolean,
  cancelled  boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  with prof as (
    select user_id, lower(btrim(email)) as email, full_name, phone, created_at from public.profiles
  )
  -- website accounts
  select public.client_key(p.email, p.phone, p.full_name), p.full_name, p.email, p.phone,
         p.user_id, p.created_at, 'account', p.user_id, 0::numeric, false, false
    from prof p
  union all
  -- memberships, passes and drop-ins
  select public.client_key(coalesce(uo.guest_email, pr.email), coalesce(uo.guest_phone, pr.phone), coalesce(uo.guest_name, pr.full_name)),
         coalesce(uo.guest_name, pr.full_name), coalesce(lower(btrim(uo.guest_email)), pr.email), coalesce(uo.guest_phone, pr.phone),
         uo.user_id, uo.created_at, 'membership', uo.id, coalesce(uo.price_paid, 0),
         uo.status = 'active', uo.status = 'cancelled'
    from public.user_offerings uo
    left join prof pr on pr.user_id = uo.user_id
  union all
  -- classes (the day of the class is when it happened)
  select public.client_key(coalesce(cb.guest_email, pr.email), coalesce(cb.guest_phone, pr.phone), coalesce(cb.guest_name, pr.full_name)),
         coalesce(cb.guest_name, pr.full_name), coalesce(lower(btrim(cb.guest_email)), pr.email), coalesce(cb.guest_phone, pr.phone),
         cb.user_id, coalesce(cs.start_time, cb.created_at), 'class', cb.id,
         case when cb.payment_status = 'paid' then coalesce(cb.total_price, 0) else 0 end,
         false, cb.status in ('cancelled', 'payment_failed')
    from public.class_bookings cb
    left join public.class_schedule cs on cs.id = cb.schedule_id
    left join prof pr on pr.user_id = cb.user_id
  union all
  -- treatments booked through the website or entered by staff
  select public.client_key(coalesce(b.guest_email, pr.email), coalesce(b.guest_phone, pr.phone), coalesce(b.guest_name, pr.full_name)),
         coalesce(b.guest_name, pr.full_name), coalesce(lower(btrim(b.guest_email)), pr.email), coalesce(b.guest_phone, pr.phone),
         b.user_id, coalesce(b.start_time, b.booking_date::timestamptz), 'treatment', b.id,
         coalesce(b.total_price, 0), false,
         b.status in ('cancelled', 'payment_failed')
    from public.bookings b
    left join prof pr on pr.user_id = b.user_id
  union all
  -- treatment-calendar entries with a client on them (walk-ins, phone bookings)
  select public.client_key(ace.client_email, null, ace.client_name),
         ace.client_name, lower(btrim(ace.client_email)), null,
         null, ace.entry_date::timestamptz, 'calendar', ace.id, 0::numeric, false, false
    from public.admin_calendar_entries ace
   where nullif(btrim(coalesce(ace.client_email, ace.client_name, '')), '') is not null;
$fn$;

revoke all on function public.client_events() from public, anon, authenticated;

-- ── The list ───────────────────────────────────────────────────────────────
create or replace function public.admin_client_directory()
returns table (
  client_key         text,
  name               text,
  email              text,
  phone              text,
  has_account        boolean,
  first_seen         timestamptz,
  last_activity      timestamptz,
  classes            integer,
  treatments         integer,
  memberships        integer,
  memberships_active integer,
  total_value        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;

  return query
  select e.client_key,
         (array_agg(e.name  order by e.happened desc) filter (where nullif(btrim(e.name),  '') is not null))[1],
         (array_agg(e.email order by e.happened desc) filter (where nullif(btrim(e.email), '') is not null))[1],
         (array_agg(e.phone order by e.happened desc) filter (where nullif(btrim(e.phone), '') is not null))[1],
         bool_or(e.kind = 'account'),
         min(e.happened),
         max(e.happened),
         (count(*) filter (where e.kind = 'class'      and not e.cancelled))::integer,
         (count(*) filter (where e.kind = 'treatment'  and not e.cancelled))::integer,
         (count(*) filter (where e.kind = 'membership'))::integer,
         (count(*) filter (where e.kind = 'membership' and e.is_active))::integer,
         coalesce(sum(e.amount) filter (where not e.cancelled), 0)
    from public.client_events() e
   where e.client_key is not null
   group by e.client_key;
end;
$fn$;

comment on function public.admin_client_directory() is
  'Admin: every client the studio has, with or without a website account.';

revoke all on function public.admin_client_directory() from public, anon;
grant execute on function public.admin_client_directory() to authenticated;

-- ── One person, everything ─────────────────────────────────────────────────
create or replace function public.admin_client_history(_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out jsonb;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'person', (
      select jsonb_build_object(
        'name',  (array_agg(name  order by happened desc) filter (where nullif(btrim(name),  '') is not null))[1],
        'email', (array_agg(email order by happened desc) filter (where nullif(btrim(email), '') is not null))[1],
        'phone', (array_agg(phone order by happened desc) filter (where nullif(btrim(phone), '') is not null))[1],
        'has_account', bool_or(kind = 'account'),
        'account_since', min(happened) filter (where kind = 'account'),
        'first_seen', min(happened)
      )
      from public.client_events() where client_key = _key
    ),

    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', uo.id, 'name', uo.name_snapshot, 'type', uo.type, 'status', uo.status,
               'price_paid', uo.price_paid, 'is_unlimited', uo.is_unlimited,
               'credits_total', uo.credits_total, 'credits_remaining', uo.credits_remaining,
               'starts_at', uo.starts_at, 'expires_at', uo.expires_at, 'created_at', uo.created_at,
               'code', uo.code, 'source', uo.source, 'notes', uo.notes,
               'classes_used', (select count(*) from public.offering_redemptions r where r.user_offering_id = uo.id)
             ) order by uo.created_at desc)
        from public.user_offerings uo
       where uo.id in (select ce.ref_id from public.client_events() ce where ce.client_key = _key and ce.kind = 'membership')
    ), '[]'::jsonb),

    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cb.id, 'class', c.title, 'starts_at', cs.start_time, 'instructor', coalesce(nullif(cs.instructor, ''), c.instructor),
               'status', cb.status, 'payment_method', cb.payment_method, 'payment_status', cb.payment_status,
               'price', cb.total_price, 'coupon', cb.coupon_code, 'discount', cb.discount_amount,
               'pass', uo.name_snapshot, 'booked_at', cb.created_at
             ) order by cs.start_time desc nulls last)
        from public.class_bookings cb
        left join public.class_schedule cs on cs.id = cb.schedule_id
        left join public.classes c on c.id = cs.class_id
        left join public.user_offerings uo on uo.id = cb.user_offering_id
       where cb.id in (select ce.ref_id from public.client_events() ce where ce.client_key = _key and ce.kind = 'class')
    ), '[]'::jsonb),

    'treatments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'service', coalesce(nullif(b.title, ''), s.title), 'date', b.booking_date,
               'time', b.booking_time, 'status', b.status, 'price', b.total_price,
               'coupon', b.coupon_code, 'discount', b.discount_amount, 'notes', b.notes, 'booked_at', b.created_at
             ) order by b.booking_date desc, b.booking_time desc)
        from public.bookings b
        left join public.services s on s.id = b.service_id
       where b.id in (select ce.ref_id from public.client_events() ce where ce.client_key = _key and ce.kind = 'treatment')
    ), '[]'::jsonb),

    'calendar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ace.id, 'title', ace.title, 'date', ace.entry_date, 'time', ace.start_time,
               'calendar', ace.calendar_type, 'notes', ace.notes
             ) order by ace.entry_date desc)
        from public.admin_calendar_entries ace
       where ace.id in (select ce.ref_id from public.client_events() ce where ce.client_key = _key and ce.kind = 'calendar')
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

comment on function public.admin_client_history(text) is
  'Admin: everything about one client — details, memberships, classes, treatments, calendar.';

revoke all on function public.admin_client_history(text) from public, anon;
grant execute on function public.admin_client_history(text) to authenticated;
