-- Membership / pass expiry email notice.
-- Adds a one-time notification marker and an editable customer email template.
-- A pg_cron job invokes the `send-expiry-notices` edge function daily, which
-- finds offerings whose expires_at has passed, emails the customer, marks them
-- expired, and stamps expiry_notified_at so the notice fires exactly once.

ALTER TABLE public.user_offerings
  ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;

INSERT INTO public.email_templates
  (template_key, label, category, description, subject, heading, body_html, enabled)
VALUES (
  'offering_expired',
  'Membership / pass expired',
  'offering_expired',
  'Emailed to the customer when their membership or class pass expires.',
  'Your Holis {{offering_name}} has expired',
  'Your membership has expired 🌿',
  '<p>Hi {{guest_name}}, your <strong>{{offering_name}}</strong> at Holis Wellness Center has expired.</p>
<p>We''d love to keep you on your wellness journey — renew anytime to continue enjoying your classes and member benefits.</p>
{{button}}
<p>Thank you for being part of the Holis community. We hope to see you on the mat again soon. 🌺</p>',
  true
)
ON CONFLICT (template_key) DO NOTHING;
