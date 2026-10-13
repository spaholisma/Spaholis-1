-- Everything is Holis Wellness Center's: one price rule for classes, passes and
-- private classes.
--
-- The teachers chose not to use the Teacher Admin Panel (2026-10). Classes,
-- passes, coupons and payments are run by Holis. Until now a price came from
-- the teacher (teacher_price: her local discount for a Costa Rican cédula, or
-- one of her own coupons). From here on it comes from Holis:
--
--   · studio_pricing.local_discount_pct — the local discount for a Costa Rican
--     cédula, one setting for the whole studio (starts at the 40% Evelina had);
--   · public.coupons — the Holis coupons (Admin → Coupons), with their limits:
--     active, expiry, uses, and what they are restricted to.
--
-- holis_price() is that rule (the local discount first, else a coupon — never
-- both), used by the website to show the price and by PayPal to charge it.
-- claim_offering_with_coupon() issues a Holis pass at $0 when a coupon covers
-- it all (PayPal cannot take $0).
--
-- Passes: a Holis coupon was made for single classes or treatments (several are
-- 100%), so it works on a pass only when the team says so — the new
-- coupons.restricted_offering_ids (Admin → Coupons → "Passes & memberships").
--
-- Additive: one table, one column, two functions. Nothing that exists is changed; the
-- teacher functions stay (unused) in case the panel is switched back on.
-- Rollback at the bottom.

-- 1 ────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_pricing (
  id integer primary key default 1 check (id = 1),
  local_discount_pct numeric(5, 2) not null default 0 check (local_discount_pct >= 0 and local_discount_pct <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.studio_pricing (id, local_discount_pct)
select 1, coalesce((select max(t.local_discount_pct) from public.teachers t where t.active), 0)
on conflict (id) do nothing;

alter table public.studio_pricing enable row level security;
drop policy if exists studio_pricing_read on public.studio_pricing;
create policy studio_pricing_read on public.studio_pricing for select using (true);
drop policy if exists studio_pricing_staff_update on public.studio_pricing;
create policy studio_pricing_staff_update on public.studio_pricing for update
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'));
grant select on public.studio_pricing to anon, authenticated;
grant update (local_discount_pct, updated_at, updated_by) on public.studio_pricing to authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────
alter table public.coupons add column if not exists restricted_offering_ids uuid[];

-- Holis' price for one guest: the local discount for a valid Costa Rican
-- cédula, else a Holis coupon, else the base price. Same shape teacher_price()
-- returned, so the website reads it the same way. `_class_id`: the class (a
-- coupon restricted to classes applies only to those; a class always paid in
-- full takes no coupon). `_offering_id`: a pass — a coupon applies to it only
-- when the pass is on its list (or the coupon has no restriction at all).
create or replace function public.holis_price(
  _base numeric, _id_document text, _coupon text, _class_id uuid default null, _offering_id uuid default null
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
  full_price boolean := false;
  restricted boolean;
  disc numeric := 0;
begin
  if base <= 0 then
    return jsonb_build_object('price', greatest(base, 0), 'base', greatest(base, 0), 'discount', 0,
      'local', false, 'local_pct', 0, 'coupon', null, 'coupon_status', null);
  end if;

  select coalesce(sp.local_discount_pct, 0) into pct from public.studio_pricing sp where sp.id = 1;
  pct := coalesce(pct, 0);

  if pct > 0 and public.normalize_cr_cedula(_id_document) is not null then
    disc := round(base * pct / 100, 2);
    return jsonb_build_object('price', greatest(base - disc, 0), 'base', base, 'discount', disc,
      'local', true, 'local_pct', pct, 'coupon', null,
      'coupon_status', case when wanted <> '' then 'ignored_local' end);
  end if;

  if wanted = '' then
    return jsonb_build_object('price', base, 'base', base, 'discount', 0,
      'local', false, 'local_pct', pct, 'coupon', null, 'coupon_status', null);
  end if;

  if _class_id is not null then
    select coalesce(cl.full_price_only, false) into full_price from public.classes cl where cl.id = _class_id;
  end if;
  if coalesce(full_price, false) then
    return jsonb_build_object('price', base, 'base', base, 'discount', 0,
      'local', false, 'local_pct', pct, 'coupon', null, 'coupon_status', 'full_price_only');
  end if;

  select cp.id, cp.code, cp.discount_type, cp.discount_value, cp.is_active, cp.expires_at, cp.max_uses,
         coalesce(cp.current_uses, 0) as current_uses,
         coalesce(cp.restricted_service_ids, '{}') as rs, coalesce(cp.restricted_class_ids, '{}') as rc,
         coalesce(cp.restricted_product_ids, '{}') as rp, coalesce(cp.restricted_package_ids, '{}') as rk,
         coalesce(cp.restricted_offering_ids, '{}') as ro
    into c
  from public.coupons cp
  where upper(btrim(cp.code)) = wanted
  limit 1;

  if not found or not c.is_active
     or (c.expires_at is not null and c.expires_at < now())
     or (c.max_uses is not null and c.current_uses >= c.max_uses) then
    return jsonb_build_object('price', base, 'base', base, 'discount', 0,
      'local', false, 'local_pct', pct, 'coupon', null,
      'coupon_status', case when not found then 'not_found' else 'not_valid' end);
  end if;

  -- Restricted to something: it must be this class, or this pass.
  restricted := cardinality(c.rs) > 0 or cardinality(c.rc) > 0 or cardinality(c.rp) > 0
             or cardinality(c.rk) > 0 or cardinality(c.ro) > 0;
  if restricted and not ((_class_id is not null and _class_id = any(c.rc))
                         or (_offering_id is not null and _offering_id = any(c.ro))) then
    return jsonb_build_object('price', base, 'base', base, 'discount', 0,
      'local', false, 'local_pct', pct, 'coupon', null, 'coupon_status', 'not_for_this');
  end if;

  disc := case when c.discount_type = 'percentage'
            then round(base * least(greatest(c.discount_value, 0), 100) / 100, 2)
            else least(base, greatest(c.discount_value, 0)) end;
  return jsonb_build_object('price', greatest(base - disc, 0), 'base', base, 'discount', disc,
    'local', false, 'local_pct', pct, 'coupon', upper(btrim(c.code)), 'coupon_id', c.id,
    'coupon_status', 'applied', 'coupon_type', c.discount_type, 'coupon_value', c.discount_value);
end $$;

revoke all on function public.holis_price(numeric, text, text, uuid, uuid) from public;
grant execute on function public.holis_price(numeric, text, text, uuid, uuid) to anon, authenticated, service_role;

-- 3 ────────────────────────────────────────────────────────────────────────────
-- A Holis pass at $0 with a coupon that covers it all: checked on the server
-- (holis_price), issued like a pass bought online, the coupon's use counted.
create or replace function public.claim_offering_with_coupon(
  _offering_id uuid, _guest_name text, _guest_email text, _guest_phone text,
  _coupon text, _id_document text default null, _id_document_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o record;
  v_quote jsonb;
  v_code text;
  v_token text;
  v_id uuid;
  v_user uuid;
  v_expires timestamptz;
  v_name text := btrim(coalesce(_guest_name, ''));
  v_email text := lower(btrim(coalesce(_guest_email, '')));
  v_doc text := nullif(left(btrim(coalesce(_id_document, '')), 40), '');
  v_type text := case when nullif(btrim(coalesce(_id_document, '')), '') is not null
                       and _id_document_type in ('cr_cedula', 'other') then _id_document_type end;
begin
  if v_name = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or btrim(coalesce(_guest_phone, '')) = '' then
    raise exception 'Your name, email and phone are needed';
  end if;

  select * into o from public.offerings where id = _offering_id and status = 'active';
  if not found then raise exception 'This pass is not available'; end if;

  v_quote := public.holis_price(coalesce(o.price, 0),
    case when v_type = 'cr_cedula' then v_doc end, _coupon, null, o.id);
  if coalesce(v_quote->>'coupon_status', '') <> 'applied' or (v_quote->>'price')::numeric > 0 then
    raise exception 'That coupon does not cover this pass in full';
  end if;

  -- A monthly membership ends on the same day of the following month (as a
  -- pass bought with PayPal); class passes get their expiry from the insert trigger.
  if o.type = 'membership' and coalesce(o.duration_days, 0) > 0 then
    v_expires := case when o.duration_days % 30 = 0
                   then now() + make_interval(months => o.duration_days / 30)
                   else now() + make_interval(days => o.duration_days) end;
  end if;

  loop
    v_code := chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int)
              || lpad(floor(random()*10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.user_offerings where code = v_code);
  end loop;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  select user_id into v_user from public.profiles where lower(email) = v_email limit 1;

  insert into public.user_offerings (
    user_id, offering_id, type, name_snapshot, price_paid,
    is_unlimited, credits_total, credits_remaining, expires_at,
    status, source, code, access_token, guest_name, guest_email, guest_phone,
    id_document, id_document_type, notes
  ) values (
    v_user, o.id, o.type, o.name, 0,
    coalesce(o.is_unlimited, false), o.credits, o.credits, v_expires,
    'active', 'coupon', v_code, v_token, v_name, v_email, btrim(_guest_phone),
    v_doc, v_type,
    format('Free with Holis coupon %s', v_quote->>'coupon')
  ) returning id into v_id;

  perform public.increment_coupon_usage((v_quote->>'coupon_id')::uuid);

  return jsonb_build_object('id', v_id, 'code', v_code, 'offering_name', o.name, 'coupon', v_quote->>'coupon');
end $$;

revoke all on function public.claim_offering_with_coupon(uuid, text, text, text, text, text, text) from public;
grant execute on function public.claim_offering_with_coupon(uuid, text, text, text, text, text, text) to anon, authenticated;

-- Rollback (by hand):
--   drop function if exists public.claim_offering_with_coupon(uuid, text, text, text, text, text, text);
--   drop function if exists public.holis_price(numeric, text, text, uuid, uuid);
--   alter table public.coupons drop column if exists restricted_offering_ids;
--   drop table if exists public.studio_pricing;
