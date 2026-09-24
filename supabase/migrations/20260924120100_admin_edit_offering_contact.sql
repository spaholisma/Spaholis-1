-- Correct a customer's details on a membership or pass.
--
-- A typo in the name, the email or the phone meant deleting the membership and
-- making it again — losing its code, its link, its history and its credits in
-- the process. This lets the Admin fix the details in place.
--
-- What changes is the contact on the pass itself, which is what every future
-- email and booking made with it uses. Past bookings keep the details they were
-- made with: they are a record of what happened.

create or replace function public.admin_update_offering_contact(
  _id    uuid,
  _name  text,
  _email text,
  _phone text default null,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := nullif(lower(btrim(coalesce(_email, ''))), '');
  v_name  text := nullif(btrim(coalesce(_name, '')), '');
  v_user  uuid;
  uo      record;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;

  select * into uo from public.user_offerings where id = _id for update;
  if not found then raise exception 'Membership not found'; end if;

  if v_name is null then raise exception 'The customer''s name is required'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right';
  end if;

  -- If it was never tied to a website account and the corrected email belongs
  -- to one, tie it now so the customer sees it when they sign in. A pass that
  -- is already tied to an account is never moved to another.
  if uo.user_id is null and v_email is not null then
    select user_id into v_user from public.profiles where lower(email) = v_email limit 1;
  end if;

  update public.user_offerings
     set guest_name  = v_name,
         guest_email = v_email,
         guest_phone = nullif(btrim(coalesce(_phone, '')), ''),
         notes       = nullif(btrim(coalesce(_notes, '')), ''),
         user_id     = coalesce(user_id, v_user)
   where id = _id;

  return jsonb_build_object('id', _id, 'linked_account', v_user is not null);
end;
$fn$;

comment on function public.admin_update_offering_contact(uuid, text, text, text, text) is
  'Admin: correct the name, email, phone and notes on a customer''s membership or pass.';

revoke all on function public.admin_update_offering_contact(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_update_offering_contact(uuid, text, text, text, text) to authenticated;
