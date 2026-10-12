-- Local discount with a Costa Rican cédula, and the teachers' own coupons online.
--
-- Each teacher has a local discount (a percentage the team sets in Admin —
-- Evelina 40%, everyone else 0 for now). A student who types a Costa Rican
-- cédula de identidad (9 digits) pays that much less for her passes, her
-- classes and events paid online, and her private classes. Without a local
-- discount, one of HER coupons (teacher_coupons) can apply instead — never both.
--
-- The price is always worked out here, on the server (teacher_price), never
-- taken from the browser. The cédula is kept with the booking or the pass so
-- the teacher can check it in class.
--
-- Additive only: new columns default to "no discount", nothing existing changes
-- what it charges. Rollback at the bottom.

-- 1. The teacher's local discount — set by the team, never by the teacher.
alter table public.teachers
  add column if not exists local_discount_pct numeric(5,2) not null default 0;
do $$ begin
  alter table public.teachers
    add constraint teachers_local_discount_pct_range check (local_discount_pct >= 0 and local_discount_pct <= 100);
exception when duplicate_object then null; end $$;

update public.teachers set local_discount_pct = 40
where lower(btrim(display_name)) = 'evelina' and local_discount_pct = 0;

-- 2. Where the cédula (or passport) is kept. The student says which it is:
--    'cr_cedula' (Costa Rican cédula de identidad) or 'other' (passport, DIMEX…).
--    A US passport has 9 digits too, so the number alone cannot tell.
alter table public.class_bookings
  add column if not exists id_document text,
  add column if not exists id_document_type text,
  add column if not exists local_discount boolean not null default false;
alter table public.user_offerings
  add column if not exists id_document text,
  add column if not exists id_document_type text,
  add column if not exists local_discount boolean not null default false;
-- So a signed-in student does not type it again next time.
alter table public.profiles
  add column if not exists id_document text,
  add column if not exists id_document_type text;

-- 3. Teachers cannot change their own local discount.
create or replace function public.teachers_protect_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then
    new.updated_at := now();
    return new;
  end if;

  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'manager')) then
    -- A teacher may edit her name and her payment instructions. Nothing that
    -- affects what she owes, and nothing that grants access.
    new.studio_rate := old.studio_rate;
    new.user_id     := old.user_id;
    new.email       := old.email;
    new.active      := old.active;
    -- The private classes she can pick are set by the team.
    new.private_class_choices := old.private_class_choices;
    -- So is the local discount (Costa Rican cédula).
    new.local_discount_pct := old.local_discount_pct;
    -- Whether she may change her payment settings is the team's call too;
    -- without it, her PayPal, CompraClick and instructions stay as they are.
    -- (Cash in person she switches herself.)
    new.manages_payments := old.manages_payments;
    if not coalesce(old.manages_payments, false) then
      new.paypal_enabled       := old.paypal_enabled;
      new.paypal_email         := old.paypal_email;
      new.compraclick_enabled  := old.compraclick_enabled;
      new.compraclick_url      := old.compraclick_url;
      new.payment_instructions := old.payment_instructions;
    end if;

    if btrim(coalesce(new.display_name,'')) = '' then
      raise exception 'Your name cannot be empty';
    end if;
    if lower(btrim(new.display_name)) is distinct from lower(btrim(old.display_name))
       and exists (
         select 1 from public.teachers
         where id <> old.id and lower(btrim(display_name)) = lower(btrim(new.display_name))
       ) then
      raise exception 'Another teacher already uses that name';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $function$;

-- 4. A Costa Rican cédula de identidad, as 9 digits — or null when it is not one.
--    Accepts 1-0234-0567, 1 0234 0567, 102340567, the short 1-234-567 and a
--    leading 0 (0102340567). A DIMEX or a passport is not a cédula: null.
create or replace function public.normalize_cr_cedula(_doc text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  s text := btrim(coalesce(_doc, ''));
  m text[];
  d text;
begin
  if s = '' then return null; end if;
  -- Province, volume and entry written apart: pad each part.
  m := regexp_match(s, '^0?([1-9])[\s.\-]+([0-9]{1,4})[\s.\-]+([0-9]{1,4})$');
  if m is not null then
    return m[1] || lpad(m[2], 4, '0') || lpad(m[3], 4, '0');
  end if;
  if s !~ '^[0-9\s.\-]+$' then return null; end if;
  d := regexp_replace(s, '[^0-9]', '', 'g');
  if length(d) = 10 and left(d, 1) = '0' then d := substr(d, 2); end if;
  if d ~ '^[1-9][0-9]{8}$' then return d; end if;
  return null;
end $$;

-- 5. The price, worked out once, for every place that charges a teacher's price.
--    Local discount first; otherwise her coupon; otherwise the price as it is.
--    _id_document is passed only when the student said it is a Costa Rican
--    cédula (callers send null for a passport or other ID).
create or replace function public.teacher_price(
  _teacher_id uuid, _base numeric, _id_document text, _coupon text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  base numeric := round(coalesce(_base, 0), 2);
  pct numeric := 0;
  wanted text := upper(btrim(coalesce(_coupon, '')));
  c record;
  disc numeric := 0;
begin
  if base <= 0 then
    return jsonb_build_object('price', greatest(base, 0), 'base', greatest(base, 0), 'discount', 0,
      'local', false, 'local_pct', 0, 'coupon', null, 'coupon_status', null);
  end if;

  select coalesce(t.local_discount_pct, 0) into pct
  from public.teachers t where t.id = _teacher_id and t.active;
  pct := coalesce(pct, 0);

  if pct > 0 and public.normalize_cr_cedula(_id_document) is not null then
    disc := round(base * pct / 100, 2);
    return jsonb_build_object('price', greatest(base - disc, 0), 'base', base, 'discount', disc,
      'local', true, 'local_pct', pct, 'coupon', null,
      -- A coupon never adds to the local discount.
      'coupon_status', case when wanted <> '' then 'ignored_local' end);
  end if;

  if wanted <> '' then
    select tc.code, tc.discount_type, tc.discount_value into c
    from public.teacher_coupons tc
    where tc.teacher_id = _teacher_id and tc.is_active and upper(btrim(tc.code)) = wanted
    order by tc.created_at desc
    limit 1;
    if found then
      disc := case when c.discount_type = 'percentage'
                then round(base * least(greatest(c.discount_value, 0), 100) / 100, 2)
                else least(base, greatest(c.discount_value, 0)) end;
      return jsonb_build_object('price', greatest(base - disc, 0), 'base', base, 'discount', disc,
        'local', false, 'local_pct', pct, 'coupon', upper(btrim(c.code)), 'coupon_status', 'applied',
        'coupon_type', c.discount_type, 'coupon_value', c.discount_value);
    end if;
    return jsonb_build_object('price', base, 'base', base, 'discount', 0,
      'local', false, 'local_pct', pct, 'coupon', null, 'coupon_status', 'not_found');
  end if;

  return jsonb_build_object('price', base, 'base', base, 'discount', 0,
    'local', false, 'local_pct', pct, 'coupon', null, 'coupon_status', null);
end $$;

-- Only the server's own functions call it with a teacher id.
revoke all on function public.teacher_price(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.teacher_price(uuid, numeric, text, text) to service_role;

-- 6. The same answer for the page, by teacher name, so the price on screen
--    matches what the server will charge. Says nothing a student could not
--    find out by trying the code at checkout.
create or replace function public.quote_teacher_price(
  _teacher_name text, _base numeric, _id_document text, _coupon text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  tid uuid;
begin
  select t.id into tid from public.teachers t
  where t.active and lower(btrim(t.display_name)) = lower(btrim(coalesce(_teacher_name, '')))
  limit 1;
  if tid is null then
    return jsonb_build_object('price', greatest(round(coalesce(_base, 0), 2), 0), 'base', greatest(round(coalesce(_base, 0), 2), 0),
      'discount', 0, 'local', false, 'local_pct', 0, 'coupon', null,
      'coupon_status', case when btrim(coalesce(_coupon, '')) <> '' then 'not_found' end);
  end if;
  return public.teacher_price(tid, _base, _id_document, _coupon);
end $$;
grant execute on function public.quote_teacher_price(text, numeric, text, text) to anon, authenticated;

-- 7. Which teachers have a local discount, for the price to change on screen
--    as soon as a cédula is typed.
create or replace function public.public_local_discounts()
returns table(display_name text, local_discount_pct numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.display_name, t.local_discount_pct
  from public.teachers t
  where t.active and t.local_discount_pct > 0
  order by t.display_name
$$;
grant execute on function public.public_local_discounts() to anon, authenticated;

-- Rollback (by hand):
--   drop function if exists public.public_local_discounts();
--   drop function if exists public.quote_teacher_price(text, numeric, text, text);
--   drop function if exists public.teacher_price(uuid, numeric, text, text);
--   drop function if exists public.normalize_cr_cedula(text);
--   -- teachers_protect_fields: re-run it from 20261010120000_teacher_payments_holis.sql
--   alter table public.profiles drop column if exists id_document_type, drop column if exists id_document;
--   alter table public.user_offerings drop column if exists local_discount, drop column if exists id_document_type, drop column if exists id_document;
--   alter table public.class_bookings drop column if exists local_discount, drop column if exists id_document_type, drop column if exists id_document;
--   alter table public.teachers drop constraint if exists teachers_local_discount_pct_range;
--   alter table public.teachers drop column if exists local_discount_pct;
