-- Contabilidad: the expense side of the Excel, so the year shows the net profit
-- like its "Income" sheet:
--
--   Ganancia neta = HWC del mes − Gastos mensuales − Depreciación − Compras del mes
--   (and, as in the Excel, a column with 4% of it)
--
--   accounting_month_settings ← "Income" col I (exchange rate of each month) and
--                                col D (depreciation used that month; empty = the
--                                equipment total, like 'Initial Expenses'!H33)
--   accounting_expense_items  ← "Monthly Expenses" (one line per concept, the 12
--                                months in colones; ÷ that month's exchange rate)
--   accounting_purchases      ← the purchases table under each month's totals
--                                (colones ÷ the rate written on each purchase)
--   accounting_assets         ← "Initial Expenses" (equipment and its
--                                depreciation: (dollars − salvage) ÷ years ÷ 12)
--
-- Full admins only, like the rest of Contabilidad.

create table if not exists public.accounting_month_settings (
  year integer not null references public.accounting_years(year) on delete cascade,
  month integer not null check (month between 1 and 12),
  exchange_rate numeric(10, 2) check (exchange_rate is null or exchange_rate > 0),
  depreciation numeric(12, 2),
  primary key (year, month)
);

create table if not exists public.accounting_expense_items (
  id uuid primary key default gen_random_uuid(),
  year integer not null references public.accounting_years(year) on delete cascade,
  section text,
  label text not null check (length(btrim(label)) > 0),
  provider text,
  amounts numeric(14, 2)[] not null default array_fill(null::numeric, array[12]) check (array_length(amounts, 1) = 12),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists accounting_expense_items_year_idx on public.accounting_expense_items (year, sort_order);

create table if not exists public.accounting_purchases (
  id uuid primary key default gen_random_uuid(),
  year integer not null references public.accounting_years(year) on delete cascade,
  month integer not null check (month between 1 and 12),
  purchase_date date,
  category text,
  product text,
  amount_crc numeric(14, 2),
  exchange_rate numeric(10, 2) check (exchange_rate is null or exchange_rate > 0),
  amount_usd numeric(12, 2),       -- null = colones ÷ exchange rate; set = paid in dollars
  quantity numeric(10, 2),
  provider text,
  created_at timestamptz not null default now()
);
create index if not exists accounting_purchases_month_idx on public.accounting_purchases (year, month, purchase_date, created_at);

create table if not exists public.accounting_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  purchased text,                  -- as the Excel writes it: "Julio 2023"
  amount_crc numeric(14, 2),
  exchange_rate numeric(10, 2) check (exchange_rate is null or exchange_rate > 0),
  amount_usd numeric(12, 2),       -- null = colones ÷ exchange rate
  salvage numeric(12, 2) not null default 0,
  life_years numeric(5, 2) check (life_years is null or life_years > 0),
  provider text,
  active boolean not null default true,  -- counts in the monthly depreciation
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['accounting_month_settings', 'accounting_expense_items', 'accounting_purchases', 'accounting_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format($p$create policy %I on public.%I for all
      using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))
      with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'manager'))$p$, t || '_admin', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;
