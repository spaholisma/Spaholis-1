-- Admin → Clients: choose who can use the Admin Panel, and how much of it.
--
-- Access has only ever been given by hand in the database. An Admin can now
-- set it from a client's profile, as one of five levels:
--
--   client            no access to the Admin Panel
--   viewer            sees the treatments calendar, changes nothing   (viewer)
--   reception         treatments calendar, appointments, trash         (coordinator)
--   treatments_admin  reception + service/room/price, card, duplicate  (coordinator + treatment_admin)
--   admin             the whole Admin Panel                            (super_admin)
--
-- Only an Admin may change it — the same people user_roles' own policy lets
-- manage roles. Nobody can change their own access (so no one locks themselves
-- out by a slip), and the studio can never be left without an Admin. A
-- teacher's role is not an access level and is left as it is.

-- ── 1. Set someone's access level ───────────────────────────────────────────
create or replace function public.admin_set_access_level(_user_id uuid, _level text)
returns text[]
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_roles public.app_role[];
  v_out   text[];
begin
  if not has_role(auth.uid(), 'super_admin') then
    raise exception 'Only an Admin can change who has access to the Admin Panel';
  end if;
  if _user_id is null or not exists (select 1 from auth.users u where u.id = _user_id) then
    raise exception 'This person does not have a website account';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You cannot change your own access — ask another Admin';
  end if;

  v_roles := case _level
    when 'client'           then '{}'::public.app_role[]
    when 'viewer'           then array['viewer']::public.app_role[]
    when 'reception'        then array['coordinator']::public.app_role[]
    when 'treatments_admin' then array['coordinator', 'treatment_admin']::public.app_role[]
    when 'admin'            then array['super_admin']::public.app_role[]
  end;
  if v_roles is null then
    raise exception 'Unknown access level: %', _level;
  end if;

  -- Never leave the studio without an Admin.
  if not ('super_admin' = any(v_roles))
     and has_role(_user_id, 'super_admin')
     and not exists (select 1 from public.user_roles r
                      where r.role = 'super_admin' and r.user_id <> _user_id) then
    raise exception 'The studio must keep at least one Admin';
  end if;

  delete from public.user_roles
   where user_id = _user_id
     and role in ('super_admin', 'manager', 'coordinator', 'viewer', 'treatment_admin');
  insert into public.user_roles (user_id, role)
  select _user_id, unnest(v_roles);

  select coalesce(array_agg(r.role::text order by r.role::text), '{}') into v_out
    from public.user_roles r where r.user_id = _user_id;
  return v_out;
end;
$fn$;

comment on function public.admin_set_access_level(uuid, text) is
  'Admin: set how much of the Admin Panel a person can use (client, viewer, reception, treatments_admin, admin).';

revoke all on function public.admin_set_access_level(uuid, text) from public, anon;
grant execute on function public.admin_set_access_level(uuid, text) to authenticated;

-- ── 2. The list says who is on the team ─────────────────────────────────────
-- One more column, `roles`, so the list can mark the team without asking the
-- database again. The return type changes, so it is dropped and made anew;
-- the body is 20260925120000's, word for word, plus that column.
drop function if exists public.admin_client_directory();

create function public.admin_client_directory()
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
  total_value        numeric,
  user_id            uuid,
  suspended          boolean,
  roles              text[]
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
  with agg as (
    select e.client_key,
           (array_agg(e.name  order by e.happened desc) filter (where nullif(btrim(e.name),  '') is not null))[1] as name,
           (array_agg(e.email order by e.happened desc) filter (where nullif(btrim(e.email), '') is not null))[1] as email,
           (array_agg(e.phone order by e.happened desc) filter (where nullif(btrim(e.phone), '') is not null))[1] as phone,
           bool_or(e.kind = 'account') as has_account,
           min(e.happened) as first_seen,
           max(e.happened) as last_activity,
           (count(*) filter (where e.kind = 'class'      and not e.cancelled))::integer as classes,
           (count(*) filter (where e.kind = 'treatment'  and not e.cancelled))::integer as treatments,
           (count(*) filter (where e.kind = 'membership'))::integer as memberships,
           (count(*) filter (where e.kind = 'membership' and e.is_active))::integer as memberships_active,
           coalesce(sum(e.amount) filter (where not e.cancelled), 0) as total_value,
           (array_agg(e.user_id) filter (where e.kind = 'account'))[1] as user_id
      from public.client_events() e
     where e.client_key is not null
     group by e.client_key
  )
  select a.client_key, a.name, a.email, a.phone, a.has_account, a.first_seen, a.last_activity,
         a.classes, a.treatments, a.memberships, a.memberships_active, a.total_value,
         a.user_id,
         coalesce(u.banned_until > now(), false),
         coalesce((select array_agg(r.role::text order by r.role::text)
                     from public.user_roles r where r.user_id = a.user_id), '{}')
    from agg a
    left join auth.users u on u.id = a.user_id;
end;
$fn$;

comment on function public.admin_client_directory() is
  'Admin: every client the studio has, with or without a website account.';

revoke all on function public.admin_client_directory() from public, anon;
grant execute on function public.admin_client_directory() to authenticated;

-- ── 3. The profile knows their access, and whether you may change it ─────────
-- Same return type (jsonb): the person block gains `roles`, `can_manage_access`
-- (you are an Admin) and `is_self` (it is you). The rest is 20260925120000's,
-- word for word.
create or replace function public.admin_client_history(_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out  jsonb;
  v_user uuid;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;

  select (array_agg(ce.user_id) filter (where ce.kind = 'account'))[1] into v_user
    from public.client_events() ce where ce.client_key = _key;

  select jsonb_build_object(
    'person', (
      select jsonb_build_object(
        'name',  (array_agg(name  order by happened desc) filter (where nullif(btrim(name),  '') is not null))[1],
        'email', (array_agg(email order by happened desc) filter (where nullif(btrim(email), '') is not null))[1],
        'phone', (array_agg(phone order by happened desc) filter (where nullif(btrim(phone), '') is not null))[1],
        'has_account', bool_or(kind = 'account'),
        'account_since', min(happened) filter (where kind = 'account'),
        'first_seen', min(happened),
        'user_id', v_user,
        'suspended', coalesce((select u.banned_until > now() from auth.users u where u.id = v_user), false),
        'last_sign_in', (select u.last_sign_in_at from auth.users u where u.id = v_user),
        'is_staff', exists (select 1 from public.user_roles r where r.user_id = v_user)
                    or exists (select 1 from public.teachers t where t.user_id = v_user),
        'roles', coalesce((select to_jsonb(array_agg(r.role::text order by r.role::text))
                             from public.user_roles r where r.user_id = v_user), '[]'::jsonb),
        'can_manage_access', has_role(auth.uid(), 'super_admin'),
        'is_self', coalesce(v_user = auth.uid(), false)
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
