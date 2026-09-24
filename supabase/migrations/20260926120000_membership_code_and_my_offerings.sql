-- Booking a class with the pass you already have.
--
-- Two gaps on the class booking page:
--
-- 1. Someone signed in to spaholis.com did not see a pass the studio had sold
--    them at the desk: it was filed under their email, not their account, so
--    they were asked to pay. `link_my_offerings()` attaches to the signed-in
--    person the passes and memberships filed under THEIR confirmed email —
--    exactly what Admin → Clients does when it creates an account for them.
--
-- 2. Someone not signed in typed their pass code ("RD4424") in the coupon box
--    and nothing happened. `membership_token_for_code()` turns a code into the
--    same secure link token the "Schedule your classes" email carries, so the
--    existing no-login booking (book_class_with_membership_token) takes over.
--    It needs the code AND the email the pass was sold to, so a code alone —
--    six characters — cannot be guessed into someone else's pass, and it says
--    nothing about which of the two did not match.

-- ── 1. The signed-in person's own passes ───────────────────────────────────
create or replace function public.link_my_offerings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  n       integer := 0;
begin
  if v_uid is null then return 0; end if;

  -- Only an address the person has proven they own.
  select lower(btrim(email)) into v_email
    from auth.users
   where id = v_uid and email_confirmed_at is not null;
  if v_email is null or v_email = '' then return 0; end if;

  -- Only passes nobody owns yet; one that belongs to an account stays there.
  update public.user_offerings
     set user_id = v_uid
   where user_id is null
     and lower(btrim(guest_email)) = v_email;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

comment on function public.link_my_offerings() is
  'Attach to the signed-in user the unowned passes/memberships sold to their confirmed email.';

revoke all on function public.link_my_offerings() from public, anon;
grant execute on function public.link_my_offerings() to authenticated;

-- ── 2. A pass code, with the email it was sold to ─────────────────────────
create or replace function public.membership_token_for_code(_code text, _email text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code  text := upper(btrim(coalesce(_code, '')));
  v_email text := lower(btrim(coalesce(_email, '')));
  v_id    uuid;
  v_token text;
begin
  if length(v_code) < 4 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return null;
  end if;

  select uo.id, uo.access_token into v_id, v_token
    from public.user_offerings uo
   where upper(btrim(uo.code)) = v_code
     and uo.status = 'active'
     and (lower(btrim(uo.guest_email)) = v_email
          or (uo.user_id is not null and exists (
                select 1 from public.profiles p
                 where p.user_id = uo.user_id and lower(btrim(p.email)) = v_email)))
   order by uo.created_at desc
   limit 1;

  if v_id is null then return null; end if;

  -- Older passes were made before every pass carried a link.
  if v_token is null or length(v_token) < 20 then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.user_offerings set access_token = v_token where id = v_id;
  end if;

  return v_token;
end;
$fn$;

comment on function public.membership_token_for_code(text, text) is
  'Turn a pass/membership code plus the email it was sold to into its booking-link token.';

revoke all on function public.membership_token_for_code(text, text) from public;
grant execute on function public.membership_token_for_code(text, text) to anon, authenticated;
