-- Retreats: a safety copy before the new admin editor, and an email to the
-- team for every retreat inquiry.
--
-- Nothing here changes or removes existing data. The retreats keep their
-- rows exactly as they are; the admin editor only writes the same columns
-- the website already reads.

-- 1. Safety copy of the retreats as they are today (admins/service role only).
create table if not exists public.retreats_backup_20260914 as table public.retreats;
alter table public.retreats_backup_20260914 enable row level security;
revoke all on public.retreats_backup_20260914 from anon, authenticated;

-- 2. Guests could not send the inquiry form on a retreat's page: the table
--    had an "anyone can submit" policy but no INSERT grant, so the database
--    refused it. Grant it (policies still decide who may do what).
grant insert on public.retreat_inquiries to anon, authenticated;
grant insert on public.custom_retreat_inquiries to anon, authenticated;
grant select, update on public.retreat_inquiries to authenticated;

-- 3. Inquiries from a retreat's page and from the custom-retreat form were
--    saved but nobody was told. Email the team, signed with the same secret
--    the booking emails use. An email problem must never block the inquiry.
create or replace function public.notify_retreat_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.internal_secrets where name = 'booking_notify';
  if v_secret is null then return new; end if;

  perform net.http_post(
    url     := 'https://zhdqjtgtolnksiaepxbd.supabase.co/functions/v1/send-inquiry-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := jsonb_build_object('table', tg_table_name, 'id', new.id)
  );
  return new;
exception when others then
  raise warning 'notify_retreat_inquiry failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_retreat_inquiry() from public, anon, authenticated;

drop trigger if exists retreat_inquiries_notify on public.retreat_inquiries;
create trigger retreat_inquiries_notify
  after insert on public.retreat_inquiries
  for each row execute function public.notify_retreat_inquiry();

drop trigger if exists custom_retreat_inquiries_notify on public.custom_retreat_inquiries;
create trigger custom_retreat_inquiries_notify
  after insert on public.custom_retreat_inquiries
  for each row execute function public.notify_retreat_inquiry();
