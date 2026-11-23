-- Booking details on a calendar entry, each in its own field instead of typed
-- into the Notes: what to charge, who booked it (and how), who confirmed it,
-- who earns the commission, the treatment with its minutes, and the link
-- (e.g. the card form). The client's name is the existing client_name.
--
-- Additive only: every column is nullable, old entries keep their Notes as
-- they are, and RLS/grants on the table already cover new columns.
alter table public.admin_calendar_entries
  add column if not exists charge_amount numeric(10, 2),
  add column if not exists booked_by text,
  add column if not exists confirmed_by text,
  add column if not exists commission_to text,
  add column if not exists treatment_label text,
  add column if not exists link_url text,
  add column if not exists link_label text;

alter table public.admin_calendar_entries
  drop constraint if exists admin_calendar_entries_charge_amount_check;
alter table public.admin_calendar_entries
  add constraint admin_calendar_entries_charge_amount_check
  check (charge_amount is null or charge_amount >= 0);

-- Only http(s) links, so a pasted "javascript:" address can never be clicked.
alter table public.admin_calendar_entries
  drop constraint if exists admin_calendar_entries_link_url_check;
alter table public.admin_calendar_entries
  add constraint admin_calendar_entries_link_url_check
  check (link_url is null or link_url ~* '^https?://');
