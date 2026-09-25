-- Adding a teacher, for real.
--
-- Until now Admin → Teachers saved a name and, if she already had a website
-- account, linked it. If she had none, the email was kept "so it links once
-- she signs up" — but nothing did that link, so she never reached her panel
-- unless someone went back and linked her by hand.
--
-- Now:
--   1. admin_add_teacher() saves her with a checked name and email, and links
--      her account at once when she already has one.
--   2. Signing up with that email (on her own, or by the invitation the Admin
--      sends) links her automatically and gives her the teacher role.
--   3. The moment she is linked, she is emailed how to open her Teacher Panel
--      (notify-teacher, event "teacher_welcome") — with a link to choose her
--      password when she has never signed in.

-- ── 1. Add a teacher ─────────────────────────────────────────────────────────
create or replace function public.admin_add_teacher(_name text, _email text, _rate numeric default 35)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name  text := btrim(coalesce(_name, ''));
  v_email text := lower(btrim(coalesce(_email, '')));
  v_rate  numeric := coalesce(_rate, 35);
  v_user  uuid;
  v_id    uuid;
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')) then
    raise exception 'Not authorized';
  end if;
  if length(v_name) < 2 then
    raise exception 'Her name is required';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right';
  end if;
  if v_rate < 0 then
    raise exception 'The studio rent cannot be negative';
  end if;
  if exists (select 1 from public.teachers where lower(btrim(display_name)) = lower(v_name)) then
    raise exception 'There is already a teacher called %', v_name;
  end if;
  if exists (select 1 from public.teachers where lower(btrim(email)) = v_email) then
    raise exception 'Another teacher already uses %', v_email;
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if v_user is not null and exists (select 1 from public.teachers where user_id = v_user) then
    raise exception 'That account already belongs to another teacher';
  end if;

  insert into public.teachers (display_name, email, studio_rate, user_id)
  values (v_name, v_email, v_rate, v_user)
  returning id into v_id;

  if v_user is not null then
    insert into public.user_roles (user_id, role) values (v_user, 'teacher')
    on conflict do nothing;
  end if;

  return jsonb_build_object('teacher_id', v_id, 'linked', v_user is not null);
end;
$fn$;

comment on function public.admin_add_teacher(text, text, numeric) is
  'Admin: add a teacher; links her website account at once when she has one.';

revoke all on function public.admin_add_teacher(text, text, numeric) from public, anon;
grant execute on function public.admin_add_teacher(text, text, numeric) to authenticated;

-- ── 2. Signing up with a teacher's email links her ──────────────────────────
-- Runs when the website account's profile is made (handle_new_user), whether
-- she signed up herself or the Admin sent her an invitation.
create or replace function public.link_teacher_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_teacher uuid;
begin
  if new.user_id is null or coalesce(btrim(new.email), '') = '' then return new; end if;

  select t.id into v_teacher
    from public.teachers t
   where t.user_id is null and lower(btrim(t.email)) = lower(btrim(new.email))
   limit 1;
  if v_teacher is null then return new; end if;

  update public.teachers set user_id = new.user_id where id = v_teacher;
  insert into public.user_roles (user_id, role) values (new.user_id, 'teacher')
  on conflict do nothing;
  return new;
exception when others then
  -- Making the account must never fail because of this.
  raise warning 'link_teacher_on_signup failed: %', sqlerrm;
  return new;
end;
$fn$;

drop trigger if exists trg_link_teacher_on_signup on public.profiles;
create trigger trg_link_teacher_on_signup
  after insert on public.profiles
  for each row execute function public.link_teacher_on_signup();

-- The link above is made by our own trigger, not by the new user: let it
-- through the guard that stops a teacher from giving herself access.
-- Otherwise exactly as before.
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

-- ── 3. Once linked, she is told how to open her panel ───────────────────────
create or replace function public.notify_teacher_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
begin
  if new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id then return new; end if;
  if coalesce(current_setting('holis.quiet_teacher_notify', true), '') = 'on' then return new; end if;

  select value into v_secret from public.internal_secrets where name = 'notify_teacher';
  if v_secret is null then return new; end if;

  perform net.http_post(
    url     := 'https://zhdqjtgtolnksiaepxbd.supabase.co/functions/v1/notify-teacher',
    headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', v_secret),
    body    := jsonb_build_object('event', 'teacher_welcome', 'teacherId', new.id)
  );
  return new;
exception when others then
  raise warning 'notify_teacher_welcome failed: %', sqlerrm;
  return new;
end;
$fn$;

drop trigger if exists trg_notify_teacher_welcome on public.teachers;
create trigger trg_notify_teacher_welcome
  after insert or update of user_id on public.teachers
  for each row execute function public.notify_teacher_welcome();
