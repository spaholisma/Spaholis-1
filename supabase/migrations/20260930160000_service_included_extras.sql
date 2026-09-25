-- Extras a treatment already includes are not offered with it.
--
-- The booking page offers every add-on extra (services.is_addon) with every
-- treatment. Some treatments already include one — the Somato Awareness System
-- Massage comes with the Aromatherapy with Kinesiology Test — and offering it
-- again as a paid extra is wrong. A treatment now lists the extras it includes;
-- those are left out of its "Enhance your treatment" list. Set in
-- Admin → Services, on the treatment.
alter table public.services
  add column if not exists included_addon_ids uuid[] not null default '{}';

comment on column public.services.included_addon_ids is
  'Add-on extras (services.is_addon) this treatment already includes — not offered as extras with it.';

-- Both lengths of the Somato Awareness System Massage include the
-- Aromatherapy with Kinesiology Test.
update public.services s
   set included_addon_ids = (
     select coalesce(array_agg(a.id), '{}')
       from public.services a
      where a.is_addon and a.title = 'Aromatherapy with Kinesiology Test'
   )
 where s.title like 'Somato Awareness System Massage%'
   and not s.is_addon;
