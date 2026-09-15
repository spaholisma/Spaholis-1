-- Safety copy of the website texts (site_content) before Admin > Services
-- starts editing private classes, studio rental rates and signature cards
-- there. Nothing is changed or removed; only admins/service role can read it.
create table if not exists public.site_content_backup_20260914 as table public.site_content;
alter table public.site_content_backup_20260914 enable row level security;
revoke all on public.site_content_backup_20260914 from anon, authenticated;
