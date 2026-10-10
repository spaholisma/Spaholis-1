-- Teachers' payments, for now: every online payment goes to Holis.
--
--  1. teacher_payouts_enabled() — one switch, false for now. While it is off,
--     no class or pass is paid to a teacher's own PayPal or CompraClick: the
--     website does not offer it and the booking functions refuse it. (The
--     PayPal order function has the same switch in its code.)
--  2. teachers.cash_enabled — each teacher switches "pay cash in person" on or
--     off for her own classes (default on, as today).
--  3. teachers.manages_payments — who may change her PayPal / CompraClick /
--     payment instructions in her panel. Only Evelina for now; the rest see
--     them locked. The team can change it in Admin.
--
-- Additive: two new columns with defaults, one new function, the same public
-- functions with one more column. Needs 20261008170000 (private_class_choices).

create or replace function public.teacher_payouts_enabled()
 returns boolean language sql immutable as $$ select false $$;
grant execute on function public.teacher_payouts_enabled() to anon, authenticated;

alter table public.teachers
  add column if not exists cash_enabled boolean not null default true,
  add column if not exists manages_payments boolean not null default false;

update public.teachers set manages_payments = true
 where id = '0839ddb9-ebec-4917-bc7e-570fe0ed9594';  -- Evelina

-- What a teacher may change on her own row.
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

-- The public list of teachers: + accepts_cash. Her PayPal / CompraClick only
-- count while teacher payouts are on (off for now: everything goes to Holis).
drop function if exists public.public_teachers();
create function public.public_teachers()
 returns table(id uuid, display_name text, photo_url text, bio text,
               accepts_paypal boolean, compraclick_url text, accepts_cash boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.display_name, t.photo_url, t.bio,
         public.teacher_payouts_enabled()
           and (t.paypal_enabled and t.paypal_email is not null and btrim(t.paypal_email) <> ''),
         case when public.teacher_payouts_enabled() and t.compraclick_enabled then nullif(btrim(t.compraclick_url), '') end,
         t.cash_enabled
  from public.teachers t
  where t.active
  order by t.display_name
$function$;
grant execute on function public.public_teachers() to public, anon, authenticated;

create or replace function public.public_teacher_portfolios()
 returns table(membership_id uuid, teacher_name text, membership_name text, price numeric, classes_included integer,
               valid_days integer, description text, payment_link text, payment_note text,
               teacher_payment_instructions text, teacher_accepts_paypal boolean, teacher_compraclick_url text)
 language sql stable security definer set search_path to 'public'
as $function$
  select m.id, t.display_name, m.name, m.price, m.classes_included, m.valid_days,
         m.description, m.payment_link, m.payment_note, t.payment_instructions,
         public.teacher_payouts_enabled()
           and (t.paypal_enabled and t.paypal_email is not null and btrim(t.paypal_email) <> ''),
         case when public.teacher_payouts_enabled() and t.compraclick_enabled then nullif(btrim(t.compraclick_url), '') end
  from public.teachers t
  join public.teacher_memberships m on m.teacher_id = t.id
  where t.active and m.is_active
  order by t.display_name, m.price nulls last
$function$;

-- Cash in person: refused when the session's teacher switched it off.
-- CompraClick to her own link: refused while teacher payouts are off.
-- Both edit the live definitions in one place each and stop if the place
-- is not found, so nothing else in them changes.
do $migration$
declare d text; n text;
begin
  d := pg_get_functiondef('public.book_class_pay_cash(uuid,text,text,text,text[])'::regprocedure);
  n := replace(d, E'  v_price := coalesce(s.price, 0);\n',
    E'  -- She switched "pay cash in person" off for her classes.\n'
    || E'  if exists (\n'
    || E'    select 1 from public.teachers t\n'
    || E'     where t.active and not t.cash_enabled\n'
    || E'       and lower(btrim(t.display_name)) = lower(coalesce(nullif(btrim(s.instructor), \'\'), nullif(btrim(s.class_instructor), \'\'), \'\'))\n'
    || E'  ) then\n'
    || E'    return jsonb_build_object(\'ok\', false, \'reason\', \'cash_not_accepted\');\n'
    || E'  end if;\n'
    || E'  v_price := coalesce(s.price, 0);\n');
  if n = d then raise exception 'book_class_pay_cash: place for the cash check not found'; end if;
  execute n;

  d := pg_get_functiondef('public.book_class_pay_compraclick(uuid,text,text,text,text[])'::regprocedure);
  n := replace(d, E'  if v_link is null then\n',
    E'  -- For now every online payment goes to Holis, not to her own link.\n'
    || E'  if not public.teacher_payouts_enabled() then v_link := null; end if;\n'
    || E'  if v_link is null then\n');
  if n = d then raise exception 'book_class_pay_compraclick: place for the payouts check not found'; end if;
  execute n;
end $migration$;

notify pgrst, 'reload schema';
