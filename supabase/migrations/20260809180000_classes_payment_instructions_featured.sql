-- Per-class direct-to-teacher payment instructions (shown on the booking page
-- and in the confirmation email via the {{payment_note}} template var, for
-- classes/workshops not paid through the site), plus a "feature this class on
-- the web until" timestamp used by the FeaturedWorkshop highlight (Classes page
-- + homepage) which auto-hides after the date passes.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS payment_instructions text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS payment_instructions_es text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS featured_until timestamptz;
