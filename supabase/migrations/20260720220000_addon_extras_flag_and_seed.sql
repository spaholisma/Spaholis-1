-- Add-on extras: attach to a treatment (add price + extra minutes), never
-- bookable on their own. duration_minutes holds the EXTRA minutes.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.services.is_addon IS 'Add-on extra: not bookable alone; attaches to a treatment (adds price + extra minutes). duration_minutes = the extra minutes.';

INSERT INTO public.services
  (title, description, category, type, duration_minutes, price, is_active, is_online, requires_payment, is_addon, sort_order, sessions)
VALUES
  ('Aromatherapy with Kinesiology Test',
   'Enjoy a personalized aromatherapy session combined with our exclusive Kinesiology Test. This session identifies the essential oils that best suit your body''s needs, promoting balance and overall well-being. The customized blend enhances relaxation, supports emotional health, and leaves you feeling rejuvenated.',
   'Add-ons', 'treatment', 15, 28, true, false, false, true, 200, 1),
  ('AromaTouch Technique',
   'A clinical approach to aromatherapy by Doterra, using eight different essential oils, developed based on research and proven to effectively promote both physical and emotional well-being.',
   'Add-ons', 'treatment', 30, 57, true, false, false, true, 201, 1),
  ('Cupping',
   'Using gentle cupping therapy, your therapist can focus on a specific area — especially effective for tense and congested muscles.',
   'Add-ons', 'treatment', 15, 32, true, false, false, true, 202, 1);
