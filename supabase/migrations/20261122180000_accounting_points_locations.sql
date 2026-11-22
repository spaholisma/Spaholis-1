-- Contabilidad, as the Excel works when a row is filled in:
--
-- 1. Puntos (the Excel's column P from September on): each row's therapist
--    points = the points of its treatment in "puntos terap". Here they come
--    from Listas → Tratamientos by themselves; a row can still have its own
--    figure typed in (accounting_entries.points; empty = from the list).
-- 2. Lugar: the Excel had no dropdown for it (every place typed by hand). Now a
--    list of places (Listas → Lugares), like the other dropdowns.
-- 3. "Toning and Sliming Treatment" is twice in "puntos terap" (1 and 2 points);
--    the sheet's rows used 1 — the first one, as a VLOOKUP would.

alter table public.accounting_entries add column if not exists points numeric(4, 1)
  check (points is null or points >= 0);

alter table public.accounting_lists drop constraint if exists accounting_lists_kind_check;
alter table public.accounting_lists add constraint accounting_lists_kind_check
  check (kind in ('treatment', 'therapist', 'hotel', 'pct', 'tl', 'purchase_category', 'location'));

insert into public.accounting_lists (kind, label, sort_order) values
  ('location', 'HWC', 1),
  ('location', 'Saltwater Haven', 2),
  ('location', 'Casa Fantastica', 3),
  ('location', 'Vista Hermosa', 4),
  ('location', 'Tree House', 5),
  ('location', 'Casa Brisas', 6),
  ('location', 'Vista Azul', 7),
  ('location', 'Casa Prana', 8),
  ('location', 'Villa Oceana', 9),
  ('location', 'Villa Zest', 10),
  ('location', 'Villa Victoria', 11),
  ('location', 'Casa Española', 12),
  ('location', 'Casa Serena', 13),
  ('location', 'Villa Panacea', 14),
  ('location', 'Casa Tranquilidad', 15),
  ('location', 'Karabi Villas', 16),
  ('location', 'Villa Costa Vida', 17),
  ('location', 'Casa Magnifica', 18),
  ('location', 'Casa Dos Vistas', 19),
  ('location', 'Casa del Sol', 20),
  ('location', 'Los 3 B''s', 21),
  ('location', 'Casa Roja', 22),
  ('location', 'Casa Playa y Selva', 23),
  ('location', 'Villa Paraiso', 24),
  ('location', 'Casa Querencia', 25),
  ('location', 'Beach House', 26),
  ('location', 'Casa Samba', 27),
  ('location', 'El Salto Lote 6', 28),
  ('location', 'Villa Vigia', 29),
  ('location', 'Villa Punta de Vista', 30),
  ('location', 'Casa Elsa', 31),
  ('location', 'Casa Mariposa', 32),
  ('location', 'Casa Bamboo', 33),
  ('location', 'Villa Pelicano', 34),
  ('location', 'Bali House', 35),
  ('location', 'Casa Brisa del Mar', 36),
  ('location', 'Casa Tigre', 37),
  ('location', 'Makanda', 38),
  ('location', 'Villa Bella Vista', 39),
  ('location', 'Casa Dolce Vita', 40),
  ('location', 'Casa Calma', 41),
  ('location', 'Mango Moon', 42),
  ('location', 'Villas Tranquilas', 43),
  ('location', 'Villas Vista', 44),
  ('location', 'Chillout House', 45),
  ('location', 'Casa Tango Mango', 46),
  ('location', 'Bellamar', 47),
  ('location', 'Casa Contee', 48),
  ('location', 'Tulemar', 49),
  ('location', 'Castropolus', 50),
  ('location', 'Casa Atlantis', 51),
  ('location', 'Casa Anjali', 52)
on conflict do nothing;

update public.accounting_lists set points = 1
where kind = 'treatment' and lower(btrim(label)) = 'toning and sliming treatment';
