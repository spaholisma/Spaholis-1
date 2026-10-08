-- Partner QR scans, counted on our own server.
--
-- Every scan of a partner's QR (spaholis.com/go/<slug>) is one row: which link,
-- which partner and which of its places, where it leads, and when. Nothing
-- about the person — no IP address, no device, no cookie — so it needs no
-- consent. Google Analytics only hears about a scan when the visitor already
-- accepted analytics cookies.

create table if not exists public.partner_qr_scans (
  id          bigint generated always as identity primary key,
  slug        text not null,
  partner     text not null,
  property    text,
  destination text not null,
  scanned_at  timestamptz not null default now()
);
create index if not exists partner_qr_scans_partner_idx on public.partner_qr_scans (partner, scanned_at);

alter table public.partner_qr_scans enable row level security;

-- Only the team reads the counts. Nobody writes directly: the function below.
drop policy if exists partner_qr_scans_staff_read on public.partner_qr_scans;
create policy partner_qr_scans_staff_read on public.partner_qr_scans
  for select using (
    public.has_role(auth.uid(), 'super_admin'::app_role) or public.has_role(auth.uid(), 'manager'::app_role)
  );

-- Records one scan. Called by the /go page, so open to visitors — it only
-- accepts link names in the expected shape, and stores nothing else.
create or replace function public.record_partner_qr_scan(
  _slug text, _partner text, _property text, _destination text
) returns void
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(_slug) > 80 then return; end if;
  if _partner !~ '^[a-z0-9]+(_[a-z0-9]+)*$' or length(_partner) > 60 then return; end if;
  if _property is not null and (_property !~ '^[a-z0-9]+(_[a-z0-9]+)*$' or length(_property) > 60) then return; end if;
  if _destination not in ('whatsapp', 'google_reviews') then return; end if;
  insert into public.partner_qr_scans (slug, partner, property, destination)
  values (_slug, _partner, _property, _destination);
end $function$;

revoke all on function public.record_partner_qr_scan(text, text, text, text) from public;
grant execute on function public.record_partner_qr_scan(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
