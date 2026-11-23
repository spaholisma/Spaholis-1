-- Calendar → Contabilidad.
--
-- A calendar entry or a website booking whose "Detalles de la reserva" have
-- Cliente, Tratamiento, Cobrar (bookings: Price) and Terapeuta becomes a row
-- of Contabilidad by itself — two rows for a couple (two therapists), the
-- amount split in half, as the sheet has always done.
--
--   Agenda                     → Contabilidad
--   date                       → Fecha (+ year / month)
--   Cliente                    → Cliente
--   Tratamiento y minutos      → Tratamiento (the Contabilidad list's name)
--   Cobrar ($)  (bookings: Price) → Costo
--   Terapeuta (+ 2º terapeuta) → Terapeuta (its usual %)
--   On call / Out call + lugar → Lugar (On call = HWC)
--   Comisiona                  → Hotel/Villa (its usual %)
--
-- The row stays linked to its entry: a change in the agenda updates the row
-- (only the fields that changed there, so what was edited in Contabilidad by
-- hand — %, paid, notes… — is kept); deleting the entry, cancelling the
-- booking or clearing one of those fields removes it.
--
-- Additive and safe: new nullable columns; existing rows and entries are not
-- touched (no entry has a Terapeuta yet); a failing sync never blocks saving.

-- 1) The new fields of the agenda.
alter table public.admin_calendar_entries
  add column if not exists therapist text,
  add column if not exists therapist2 text,
  add column if not exists call_type text,
  add column if not exists call_place text;
alter table public.admin_calendar_entries drop constraint if exists admin_calendar_entries_call_type_check;
alter table public.admin_calendar_entries
  add constraint admin_calendar_entries_call_type_check check (call_type is null or call_type in ('on', 'out'));

alter table public.bookings
  add column if not exists treatment_label text,
  add column if not exists therapist text,
  add column if not exists therapist2 text,
  add column if not exists call_type text,
  add column if not exists call_place text;
alter table public.bookings drop constraint if exists bookings_call_type_check;
alter table public.bookings
  add constraint bookings_call_type_check check (call_type is null or call_type in ('on', 'out'));

-- 2) Where a row of Contabilidad came from.
alter table public.accounting_entries
  add column if not exists source_entry_id uuid references public.admin_calendar_entries(id) on delete cascade,
  add column if not exists source_booking_id uuid references public.bookings(id) on delete cascade,
  add column if not exists source_slot smallint,
  add column if not exists source_snapshot jsonb;
create unique index if not exists accounting_entries_source_entry_slot
  on public.accounting_entries (source_entry_id, source_slot) where source_entry_id is not null;
create unique index if not exists accounting_entries_source_booking_slot
  on public.accounting_entries (source_booking_id, source_slot) where source_booking_id is not null;

-- 3) Website treatments → their name in Contabilidad (one list for both).
create table if not exists public.accounting_service_map (
  service_id uuid primary key references public.services(id) on delete cascade,
  treatment text not null,
  updated_at timestamptz not null default now()
);
alter table public.accounting_service_map enable row level security;
drop policy if exists accounting_service_map_admin on public.accounting_service_map;
create policy accounting_service_map_admin on public.accounting_service_map
  for all to authenticated
  using (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'))
  with check (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager'));
grant select, insert, update, delete on public.accounting_service_map to authenticated;

-- 4) Helpers.
create or replace function public.acc_norm(_s text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(translate(coalesce(_s, ''), 'ÁÉÍÓÚÜÑáéíóúüñ´`', 'AEIOUUNaeiouun''''')), '\s+', ' ', 'g'))
$$;

-- A name as the list spells it (case/accents/spaces ignored); as typed if it isn't on the list.
create or replace function public.acc_list_label(_kind text, _name text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select l.label from public.accounting_lists l
      where l.kind = _kind and l.active and public.acc_norm(l.label) = public.acc_norm(_name)
      order by l.sort_order limit 1),
    nullif(regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g'), ''))
$$;

-- A treatment typed with its website name → its Contabilidad name.
create or replace function public.acc_treatment_name(_name text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select m.treatment from public.services s join public.accounting_service_map m on m.service_id = s.id
      where public.acc_norm(s.title) = public.acc_norm(_name)
         or public.acc_norm(s.title || ' ' || s.duration_minutes || ' mins') = public.acc_norm(_name)
      limit 1),
    _name)
$$;

-- The therapist's usual % (last one used on a treatment row), else 0.
create or replace function public.acc_therapist_pct(_therapist text)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select e.therapist_pct from public.accounting_entries e
    where public.acc_norm(e.therapist) = public.acc_norm(_therapist)
      and e.therapist_amount is null and e.therapist_pct > 0
    order by e.entry_date desc nulls last, e.created_at desc limit 1), 0)
$$;

-- The hotel's usual %: the list's, else the last one used, else 0.
create or replace function public.acc_hotel_pct(_hotel text)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case when nullif(btrim(coalesce(_hotel, '')), '') is null then 0 else coalesce(
    (select l.default_pct from public.accounting_lists l
      where l.kind = 'hotel' and public.acc_norm(l.label) = public.acc_norm(_hotel) and l.default_pct is not null
      order by l.sort_order limit 1),
    (select e.hotel_pct from public.accounting_entries e
      where public.acc_norm(e.hotel) = public.acc_norm(_hotel) and e.hotel_amount is null and e.hotel_pct > 0
      order by e.entry_date desc nulls last, e.created_at desc limit 1),
    0) end
$$;

-- 5) The sync: makes the rows of one entry / booking match what it says.
create or replace function public.accounting_sync_source(_entry_id uuid, _booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_found boolean;
  v_skip boolean := false;
  v_client text; v_treat text; v_date date; v_cost numeric;
  v_t1 text; v_t2 text; v_call text; v_place text; v_hotel text; v_loc text;
  v_names text[]; v_n int; v_i int; v_each numeric; v_slot_cost numeric;
  v_want jsonb; v_patch jsonb; v_key text;
  v_row public.accounting_entries;
begin
  if _entry_id is not null then
    select e.client_name, e.treatment_label, e.entry_date, e.charge_amount,
           e.therapist, e.therapist2, e.call_type, e.call_place, e.commission_to, e.is_all_day
      into v_client, v_treat, v_date, v_cost, v_t1, v_t2, v_call, v_place, v_hotel, v_skip
      from public.admin_calendar_entries e where e.id = _entry_id;
    v_found := found;
  else
    select b.guest_name, coalesce(nullif(btrim(b.treatment_label), ''), m.treatment), b.booking_date, b.total_price,
           b.therapist, b.therapist2, b.call_type, b.call_place, b.commission_to, b.status = 'cancelled'
      into v_client, v_treat, v_date, v_cost, v_t1, v_t2, v_call, v_place, v_hotel, v_skip
      from public.bookings b left join public.accounting_service_map m on m.service_id = b.service_id
      where b.id = _booking_id;
    v_found := found;
  end if;
  if not v_found then return; end if;

  v_client := nullif(regexp_replace(btrim(coalesce(v_client, '')), '\s+', ' ', 'g'), '');
  v_treat  := public.acc_list_label('treatment', public.acc_treatment_name(nullif(btrim(coalesce(v_treat, '')), '')));
  v_t1     := public.acc_list_label('therapist', v_t1);
  v_t2     := public.acc_list_label('therapist', v_t2);
  v_hotel  := public.acc_list_label('hotel', v_hotel);
  v_loc    := case v_call
                when 'on' then coalesce(public.acc_list_label('location', 'HWC'), 'HWC')
                when 'out' then public.acc_list_label('location', v_place)
                else null end;

  if coalesce(v_skip, false) or v_client is null or v_treat is null or v_cost is null or v_t1 is null or v_date is null then
    delete from public.accounting_entries
     where (_entry_id is not null and source_entry_id = _entry_id)
        or (_booking_id is not null and source_booking_id = _booking_id);
    return;
  end if;

  insert into public.accounting_years (year) values (extract(year from v_date)::int) on conflict do nothing;

  -- A couple: one row per therapist.
  v_names := case when v_t2 is not null then array[v_t1, v_t2] else array[v_t1] end;
  v_n := array_length(v_names, 1);
  v_each := round(v_cost / v_n, 2);

  for v_i in 1..v_n loop
    v_slot_cost := case when v_i < v_n then v_each else v_cost - v_each * (v_n - 1) end;
    v_want := jsonb_build_object(
      'year', extract(year from v_date)::int, 'month', extract(month from v_date)::int,
      'entry_date', v_date, 'client', v_client, 'treatment', v_treat, 'location', v_loc,
      'cost', v_slot_cost, 'therapist', v_names[v_i], 'hotel', v_hotel);

    select * into v_row from public.accounting_entries
     where source_slot = v_i
       and ((_entry_id is not null and source_entry_id = _entry_id)
         or (_booking_id is not null and source_booking_id = _booking_id));

    if not found then
      insert into public.accounting_entries
        (year, month, entry_date, client, treatment, location, cost, therapist, therapist_pct, hotel, hotel_pct,
         source_entry_id, source_booking_id, source_slot, source_snapshot)
      values
        ((v_want->>'year')::int, (v_want->>'month')::int, v_date, v_client, v_treat, v_loc, v_slot_cost,
         v_names[v_i], public.acc_therapist_pct(v_names[v_i]), v_hotel, public.acc_hotel_pct(v_hotel),
         _entry_id, _booking_id, v_i, v_want);
    else
      -- Only what changed in the agenda since the last sync; hand edits stay.
      v_patch := '{}'::jsonb;
      for v_key in select jsonb_object_keys(v_want) loop
        if (v_want -> v_key) is distinct from (coalesce(v_row.source_snapshot, '{}'::jsonb) -> v_key) then
          v_patch := v_patch || jsonb_build_object(v_key, v_want -> v_key);
        end if;
      end loop;
      if v_patch <> '{}'::jsonb then
        if v_patch ? 'therapist' then v_patch := v_patch || jsonb_build_object('therapist_pct', public.acc_therapist_pct(v_names[v_i])); end if;
        if v_patch ? 'hotel' then v_patch := v_patch || jsonb_build_object('hotel_pct', public.acc_hotel_pct(v_hotel)); end if;
        v_row := jsonb_populate_record(v_row, v_patch);
        update public.accounting_entries set
          year = v_row.year, month = v_row.month, entry_date = v_row.entry_date, client = v_row.client,
          treatment = v_row.treatment, location = v_row.location, cost = v_row.cost,
          therapist = v_row.therapist, therapist_pct = v_row.therapist_pct,
          hotel = v_row.hotel, hotel_pct = v_row.hotel_pct, source_snapshot = v_want
        where id = v_row.id;
      end if;
    end if;
  end loop;

  -- One therapist now (was a couple) → the second row goes.
  delete from public.accounting_entries
   where source_slot > v_n
     and ((_entry_id is not null and source_entry_id = _entry_id)
       or (_booking_id is not null and source_booking_id = _booking_id));
end;
$$;
revoke all on function public.accounting_sync_source(uuid, uuid) from public, anon, authenticated;
revoke all on function public.acc_list_label(text, text) from public, anon;
revoke all on function public.acc_treatment_name(text) from public, anon;
revoke all on function public.acc_therapist_pct(text) from public, anon;
revoke all on function public.acc_hotel_pct(text) from public, anon;

-- 6) Run it when an entry / booking is saved. A failure is logged, never blocks the save.
create or replace function public.accounting_sync_calendar_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform public.accounting_sync_source(new.id, null);
  exception when others then
    raise warning 'Contabilidad sync failed for calendar entry %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
create or replace function public.accounting_sync_booking_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform public.accounting_sync_source(null, new.id);
  exception when others then
    raise warning 'Contabilidad sync failed for booking %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.accounting_sync_calendar_trg() from public, anon, authenticated;
revoke all on function public.accounting_sync_booking_trg() from public, anon, authenticated;

drop trigger if exists accounting_sync_insert on public.admin_calendar_entries;
create trigger accounting_sync_insert after insert on public.admin_calendar_entries
  for each row when (new.therapist is not null)
  execute function public.accounting_sync_calendar_trg();
drop trigger if exists accounting_sync_update on public.admin_calendar_entries;
create trigger accounting_sync_update after update on public.admin_calendar_entries
  for each row when (new.therapist is not null or old.therapist is not null)
  execute function public.accounting_sync_calendar_trg();

drop trigger if exists accounting_sync_insert on public.bookings;
create trigger accounting_sync_insert after insert on public.bookings
  for each row when (new.therapist is not null)
  execute function public.accounting_sync_booking_trg();
drop trigger if exists accounting_sync_update on public.bookings;
create trigger accounting_sync_update after update on public.bookings
  for each row when (new.therapist is not null or old.therapist is not null)
  execute function public.accounting_sync_booking_trg();

-- 7) The dropdowns of the agenda come from Contabilidad's lists (+ clients).
create or replace function public.accounting_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')
          or has_role(auth.uid(), 'treatment_admin') or has_role(auth.uid(), 'coordinator')) then
    raise exception 'Not authorized';
  end if;
  return jsonb_build_object(
    'treatment', coalesce((select jsonb_agg(l.label order by l.category, l.sort_order) from public.accounting_lists l
       where l.kind = 'treatment' and l.active
         and public.acc_norm(l.label) not in ('salary', 'aguinaldo', 'vacaciones', 'therapist treatments commission')), '[]'::jsonb),
    'therapist', coalesce((select jsonb_agg(l.label order by l.sort_order) from public.accounting_lists l where l.kind = 'therapist' and l.active), '[]'::jsonb),
    'location', coalesce((select jsonb_agg(l.label order by l.sort_order) from public.accounting_lists l where l.kind = 'location' and l.active), '[]'::jsonb),
    'hotel', coalesce((select jsonb_agg(l.label order by l.sort_order) from public.accounting_lists l where l.kind = 'hotel' and l.active), '[]'::jsonb),
    'service_map', coalesce((select jsonb_object_agg(m.service_id, m.treatment) from public.accounting_service_map m), '{}'::jsonb),
    'client', coalesce((select jsonb_agg(x.n order by x.n) from (
        select distinct on (public.acc_norm(n)) n from (
          select regexp_replace(btrim(client), '\s+', ' ', 'g') as n from public.accounting_entries
          union all select regexp_replace(btrim(full_name), '\s+', ' ', 'g') from public.profiles
          union all select regexp_replace(btrim(guest_name), '\s+', ' ', 'g') from public.bookings
          union all select regexp_replace(btrim(client_name), '\s+', ' ', 'g') from public.admin_calendar_entries
        ) a where coalesce(n, '') <> ''
        order by public.acc_norm(n), n
      ) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.accounting_suggestions() from public, anon;
grant execute on function public.accounting_suggestions() to authenticated;

-- 8) Guests can't set the new booking fields; Duplicate copies them.
create or replace function public.bookings_staff_details_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role'
     or has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager')
     or has_role(auth.uid(), 'treatment_admin') or has_role(auth.uid(), 'coordinator') then
    return new;
  end if;
  new.booked_by := null;
  new.confirmed_by := null;
  new.commission_to := null;
  new.link_url := null;
  new.link_label := null;
  new.charge_amount := null;
  new.treatment_label := null;
  new.therapist := null;
  new.therapist2 := null;
  new.call_type := null;
  new.call_place := null;
  return new;
end;
$$;

create or replace function public.duplicate_booking(_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new uuid := gen_random_uuid();
  v_src public.bookings;
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'manager')
          or has_role(auth.uid(),'treatment_admin')) then
    raise exception 'Not authorized';
  end if;
  select * into v_src from public.bookings where id = _booking_id;
  if not found then raise exception 'Booking not found'; end if;

  insert into public.bookings
    (id, service_id, user_id, booking_date, booking_time, guest_name, guest_email, guest_phone,
     notes, total_price, coupon_code, discount_amount, status, intake_form, staff_id,
     room_id, secondary_room_id, start_time, end_time, payment_id,
     booked_by, confirmed_by, commission_to, link_url, link_label, charge_amount,
     treatment_label, therapist, therapist2, call_type, call_place)
  values
    (v_new, v_src.service_id, null, v_src.booking_date, v_src.booking_time, v_src.guest_name,
     v_src.guest_email, v_src.guest_phone, v_src.notes, v_src.total_price, null, 0,
     'confirmed', v_src.intake_form, v_src.staff_id,
     null, null, null, null, null,
     v_src.booked_by, v_src.confirmed_by, v_src.commission_to, v_src.link_url, v_src.link_label,
     v_src.charge_amount,
     v_src.treatment_label, v_src.therapist, v_src.therapist2, v_src.call_type, v_src.call_place);

  insert into public.booking_card_authorizations
    (booking_id, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text)
  select v_new, cardholder_name, card_brand, card_last4, card_expiry, card_encrypted, authorized, authorization_text
  from public.booking_card_authorizations where booking_id = _booking_id;

  return v_new;
end $function$;
