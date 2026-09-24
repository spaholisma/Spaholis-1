-- Clients: manage the person, not only look at them.
--
-- Admin → Clients could list everyone and show their history. This adds what
-- staff need to look after them: correct their details everywhere at once, see
-- whether their website login is suspended, give a walk-in client a website
-- account, and take one away without losing what they did with it.
--
-- The website login itself (create, suspend, delete, change its email) needs
-- the auth admin API and lives in the `admin-clients` function. What lives
-- here is everything the database can do on its own.

-- ── 1. The list knows about the login ─────────────────────────────────────
-- Two columns appended at the end: which account a person has, and whether it
-- is suspended. The return type changes, so the function is dropped first.
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
  suspended          boolean
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
         coalesce(u.banned_until > now(), false)
    from agg a
    left join auth.users u on u.id = a.user_id;
end;
$fn$;

comment on function public.admin_client_directory() is
  'Admin: every client the studio has, with or without a website account.';

revoke all on function public.admin_client_directory() from public, anon;
grant execute on function public.admin_client_directory() to authenticated;

-- ── 2. The history knows about the login too ──────────────────────────────
-- Same return type (jsonb), so only the person block grows.
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
                    or exists (select 1 from public.teachers t where t.user_id = v_user)
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

-- ── 3. Correct a person's details everywhere at once ──────────────────────
-- A client is spread over many rows: memberships, classes, treatments, the
-- calendar. Fixing a typo on one of them would split them into two people, so
-- the correction goes on every row that is theirs. The website login's email
-- is changed by the `admin-clients` function first; this does the rest.
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

  -- Gather what is theirs before touching anything: once the email changes,
  -- the key that finds them changes with it.
  select array_agg(ref_id) filter (where kind = 'membership'),
         array_agg(ref_id) filter (where kind = 'class'),
         array_agg(ref_id) filter (where kind = 'treatment'),
         array_agg(ref_id) filter (where kind = 'calendar'),
         (array_agg(user_id) filter (where kind = 'account'))[1]
    into v_memberships, v_classes, v_treatments, v_calendar, v_user
    from public.client_events()
   where client_key = _key
      -- A website account's sign-in email may already have been changed by
      -- then, which moves the rows that follow the account to the new key.
      -- Only those: a booking the account made for someone else (their own
      -- guest email on it) is that other person's, and stays as it is.
      or (_user_id is not null and user_id = _user_id
          and client_key = public.client_key(v_email, v_phone, v_name));

  if v_memberships is null and v_classes is null and v_treatments is null
     and v_calendar is null and v_user is null then
    raise exception 'Client not found';
  end if;

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

  return jsonb_build_object('client_key', public.client_key(v_email, v_phone, v_name));
end;
$fn$;

comment on function public.admin_update_client_contact(text, text, text, text) is
  'Admin: correct a client''s name, email and phone on every record that is theirs.';

revoke all on function public.admin_update_client_contact(text, text, text, text, uuid) from public, anon;
grant execute on function public.admin_update_client_contact(text, text, text, text, uuid) to authenticated;

-- ── 4. A new account picks up what the person already has ─────────────────
-- A walk-in given an account should sign in and see their pass, not an empty
-- page. Only records with no owner are claimed; nobody else's are ever moved.
create or replace function public.admin_link_records_to_account(_user_id uuid, _email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := nullif(lower(btrim(coalesce(_email, ''))), '');
  n_off int; n_cls int; n_trt int;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;
  if _user_id is null or v_email is null then return jsonb_build_object('linked', 0); end if;

  update public.user_offerings set user_id = _user_id
   where user_id is null and lower(btrim(guest_email)) = v_email;
  get diagnostics n_off = row_count;

  update public.class_bookings set user_id = _user_id
   where user_id is null and lower(btrim(guest_email)) = v_email;
  get diagnostics n_cls = row_count;

  update public.bookings set user_id = _user_id
   where user_id is null and lower(btrim(guest_email)) = v_email;
  get diagnostics n_trt = row_count;

  return jsonb_build_object('memberships', n_off, 'classes', n_cls, 'treatments', n_trt);
end;
$fn$;

revoke all on function public.admin_link_records_to_account(uuid, text) from public, anon;
grant execute on function public.admin_link_records_to_account(uuid, text) to authenticated;

-- ── 5. Before an account is deleted, keep who it was ──────────────────────
-- Deleting a login empties user_id on their bookings, and memberships have no
-- link to logins at all. Copy the person's name, email and phone onto every
-- record that relied on the account for them, so the history still says whose
-- it was. The login itself is then removed by the `admin-clients` function.
create or replace function public.admin_detach_client_account(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  p record;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;
  if _user_id = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  if exists (select 1 from public.user_roles where user_id = _user_id)
     or exists (select 1 from public.teachers where user_id = _user_id) then
    raise exception 'This is a staff account — it cannot be changed from Clients';
  end if;

  select full_name, lower(btrim(email)) as email, phone into p from public.profiles where user_id = _user_id;

  update public.user_offerings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone),
         user_id     = null
   where user_id = _user_id;

  update public.class_bookings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone)
   where user_id = _user_id;

  update public.bookings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone)
   where user_id = _user_id;

  return jsonb_build_object('user_id', _user_id, 'email', p.email);
end;
$fn$;

revoke all on function public.admin_detach_client_account(uuid) from public, anon;
grant execute on function public.admin_detach_client_account(uuid) to authenticated;
