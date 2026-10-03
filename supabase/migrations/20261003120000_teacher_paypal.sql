-- Teachers paid straight to their own PayPal.
--
-- Studio-rental model: Holis takes no student money. A teacher adds the email
-- of her PayPal account in her panel; from then on a class or one of her passes
-- paid online goes to HER account (PayPal "payee"), never to Holis'. Until she
-- adds it, her students pay her in cash. The email itself is never shown to
-- the public — pages only learn whether she takes PayPal.

-- 1. Her PayPal account.
alter table public.teachers add column if not exists paypal_email text;
alter table public.teachers drop constraint if exists teachers_paypal_email_format;
alter table public.teachers add constraint teachers_paypal_email_format
  check (paypal_email is null or paypal_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
-- (teachers_protect_fields already lets a teacher edit her own payment details.)

-- 2. Who each PayPal order pays, so a capture can check the money went there.
alter table public.paypal_orders add column if not exists payee_teacher_id uuid references public.teachers(id) on delete set null;
alter table public.paypal_orders add column if not exists payee_email text;
alter table public.paypal_orders drop constraint if exists paypal_orders_kind_check;
alter table public.paypal_orders add constraint paypal_orders_kind_check
  check (kind = any (array['class'::text, 'offering'::text, 'teacher_pass'::text]));

-- 3. Pages learn only yes/no: does this teacher take PayPal?
drop function if exists public.public_teacher_portfolios();
create function public.public_teacher_portfolios()
 returns table(membership_id uuid, teacher_name text, membership_name text, price numeric,
               classes_included integer, valid_days integer, description text, payment_link text,
               payment_note text, teacher_payment_instructions text, teacher_accepts_paypal boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select m.id, t.display_name, m.name, m.price, m.classes_included, m.valid_days,
         m.description, m.payment_link, m.payment_note, t.payment_instructions,
         (t.paypal_email is not null and btrim(t.paypal_email) <> '')
  from public.teachers t
  join public.teacher_memberships m on m.teacher_id = t.id
  where t.active and m.is_active
  order by t.display_name, m.price nulls last
$function$;
grant execute on function public.public_teacher_portfolios() to anon, authenticated;

drop function if exists public.public_teachers();
create function public.public_teachers()
 returns table(id uuid, display_name text, photo_url text, bio text, accepts_paypal boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.display_name, t.photo_url, t.bio,
         (t.paypal_email is not null and btrim(t.paypal_email) <> '')
  from public.teachers t
  where t.active
  order by t.display_name
$function$;
grant execute on function public.public_teachers() to anon, authenticated;

notify pgrst, 'reload schema';
