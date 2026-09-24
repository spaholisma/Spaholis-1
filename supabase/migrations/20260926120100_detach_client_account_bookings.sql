-- Clients → Delete account failed with "Bookings cannot be changed online".
--
-- Deleting a login makes the database clear user_id on that person's
-- treatment and class bookings (ON DELETE SET NULL). That happens inside the
-- auth service, where nobody from the team is signed in, so the guards that
-- stop a customer from editing their own bookings
-- (bookings_restrict_customer_updates, class_bookings_restrict_customer_updates)
-- saw an unknown user changing the owner — and refused. The login stayed.
--
-- The fix is to finish the job before the login goes: admin_detach_client_account
-- runs as the admin who pressed Delete, so it may take the bookings off the
-- account itself, after copying the person's name, email and phone onto them.
-- When the login is then deleted there is nothing left to clear and no guard
-- is asked. The guards themselves are unchanged.
--
-- Also quiet for teachers: taking a student's past class bookings off their
-- account is not news for the teacher (see holis.quiet_teacher_notify).
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

  perform set_config('holis.quiet_teacher_notify', 'on', true);

  update public.user_offerings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone),
         user_id     = null
   where user_id = _user_id;

  update public.class_bookings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone),
         user_id     = null
   where user_id = _user_id;

  update public.bookings
     set guest_name  = coalesce(nullif(btrim(guest_name), ''),  p.full_name),
         guest_email = coalesce(nullif(btrim(guest_email), ''), p.email),
         guest_phone = coalesce(nullif(btrim(guest_phone), ''), p.phone),
         user_id     = null
   where user_id = _user_id;

  perform set_config('holis.quiet_teacher_notify', 'off', true);

  return jsonb_build_object('user_id', _user_id, 'email', p.email);
end;
$fn$;

revoke all on function public.admin_detach_client_account(uuid) from public, anon;
grant execute on function public.admin_detach_client_account(uuid) to authenticated;
