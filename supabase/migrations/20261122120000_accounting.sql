-- Contabilidad (Admin → Contabilidad): the monthly accounting sheets the team
-- kept in Excel/OneDrive, now on the website. A year holds twelve months; each
-- month is a list of rows with the same columns as the Excel sheet.
--
-- Only full admins (super_admin / manager) can see or change it: it is money.
-- Nothing here is public, and nothing else on the website reads these tables.

create table if not exists public.accounting_years (
  year integer primary key check (year between 2000 and 2100),
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  year integer not null references public.accounting_years(year) on delete cascade,
  month integer not null check (month between 1 and 12),
  client text,                     -- client / concept (e.g. "Cliente directo Anna", "Quincena del 1 al 14")
  tl text,                         -- the Excel's T/L column
  treatment text,
  location text,                   -- HWC, Tree House, Casa Serena…
  entry_date date,
  cost numeric(12, 2) not null default 0,
  therapist text,
  therapist_pct numeric(6, 2) not null default 0 check (therapist_pct >= 0 and therapist_pct <= 100),
  therapist_amount numeric(12, 2), -- null = worked out from the %; set = typed by hand (e.g. salaries)
  therapist_paid boolean not null default false,
  hotel text,                      -- hotel / villa / reception that sent the client
  hotel_pct numeric(6, 2) not null default 0 check (hotel_pct >= 0 and hotel_pct <= 100),
  hotel_amount numeric(12, 2),     -- null = worked out from the %
  notes text,                      -- the Excel's last "PAID?" column
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists accounting_entries_month_idx
  on public.accounting_entries (year, month, entry_date, created_at);

alter table public.accounting_years enable row level security;
alter table public.accounting_entries enable row level security;

drop policy if exists accounting_years_admin on public.accounting_years;
create policy accounting_years_admin on public.accounting_years for all
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'));

drop policy if exists accounting_entries_admin on public.accounting_entries;
create policy accounting_entries_admin on public.accounting_entries for all
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'));

revoke all on public.accounting_years from anon, authenticated;
revoke all on public.accounting_entries from anon, authenticated;
grant select, insert, delete on public.accounting_years to authenticated;
grant select, insert, update, delete on public.accounting_entries to authenticated;

-- updated_at on every change.
create or replace function public.accounting_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists accounting_entries_touch on public.accounting_entries;
create trigger accounting_entries_touch before update on public.accounting_entries
  for each row execute function public.accounting_touch();

-- Start with 2027 (more years: "+ Año" in Contabilidad).
insert into public.accounting_years (year) values (2027) on conflict (year) do nothing;
