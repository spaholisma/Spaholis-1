-- Editable receipt email templates (purchase + refund/money handed out).
-- Admin sends them manually from the "Receipts" panel via the send-receipt
-- edge function. Same branded shell as the other customer emails.

INSERT INTO public.email_templates
  (template_key, label, category, description, subject, heading, body_html, enabled)
VALUES
(
  'receipt_purchase',
  'Purchase receipt',
  'receipts',
  'Sent manually to a customer as a receipt for a purchase.',
  'Your Holis receipt — {{concept}}',
  'Thank you for your purchase 🌿',
  '<p>Hi {{guest_name}}, thank you for your purchase at Holis Wellness Center. Here is your receipt:</p>
{{receipt_box}}
<p>We appreciate your trust and look forward to seeing you soon. 🌺</p>',
  true
),
(
  'receipt_refund',
  'Refund receipt',
  'receipts',
  'Sent manually to a customer as a receipt when money is refunded / handed back.',
  'Your Holis refund receipt — {{concept}}',
  'Your refund has been processed 🌿',
  '<p>Hi {{guest_name}}, we have processed a refund to you from Holis Wellness Center. Here are the details:</p>
{{receipt_box}}
<p>If you have any questions about this refund, just reply to this email and we''ll be happy to help. 🌺</p>',
  true
),
(
  'receipt_commission',
  'Commission payment',
  'receipts',
  'Sent to a partner (e.g. a hotel) to confirm a commission payment for a direct sale referral. Professional tone, no emojis.',
  'Commission payment from Holis Wellness Center - {{concept}}',
  'Commission Payment Confirmation',
  '<p>Dear {{guest_name}},</p>
<p>This message confirms that Holis Wellness Center has issued the following commission payment for a direct sale referral.</p>
{{receipt_box}}
<p>Thank you for your continued partnership. If you have any questions regarding this payment, please reply to this email and we will be glad to assist.</p>
<p>Kind regards,<br>Holis Wellness Center</p>',
  true
)
ON CONFLICT (template_key) DO NOTHING;
