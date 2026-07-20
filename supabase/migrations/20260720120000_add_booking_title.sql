-- Optional custom label for a booking, shown on the internal treatments
-- calendar in place of the auto-generated "Guest — Service" title. Nullable;
-- when null the UI falls back to the derived title.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.bookings.title IS 'Optional custom calendar label; falls back to "guest_name — service title" when null.';
