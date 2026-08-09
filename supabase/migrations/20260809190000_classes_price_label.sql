-- Custom display price label (e.g. a colones amount) for classes priced outside
-- the site's USD scheme (pay-to-teacher workshops). When set, the UI shows this
-- instead of the USD-formatted numeric price (which would render as "$...").
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS price_label text;
