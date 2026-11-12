-- The admin calendars update by themselves, at once.
--
-- Several people work on the Internal Calendars and the Classes calendar at the
-- same time. The website listens for changes to these tables (Supabase
-- Realtime) and reads the calendar again the moment one happens; a 15-second
-- poll stays as the safety net.
--
-- Realtime respects row-level security: a change is only announced to a
-- signed-in user who may read that row — nobody learns anything they could not
-- already read. The website only uses the message as "something changed".
--
-- Additive and idempotent. Rollback (by hand):
--   alter publication supabase_realtime drop table public.admin_calendar_entries, public.bookings,
--     public.calendar_groups, public.class_schedule, public.class_bookings, public.class_closures;

do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_calendar_entries', 'bookings', 'calendar_groups',
    'class_schedule', 'class_bookings', 'class_closures'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
