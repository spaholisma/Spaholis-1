-- Client Emails: every email a client receives is edited in the Admin panel.
--
-- Most client emails already came from Admin → Client Emails. Three did not:
--   · the treatment cancellation email (written in send-booking-notification
--     when cancelling by email and the 48-hour rule came in)
--   · the "your website account is ready" email (admin-clients)
--   · the appointment-request emails, whose templates were in the panel but no
--     longer read by any function
-- The first two get a template here holding exactly the text they send today,
-- word for word. The functions read the template and fall back to that same
-- built-in text if it is ever switched off.
--
-- The treatment confirmation template is brought up to date with what the
-- built-in email already carried: the reservation number, the price before
-- any coupon and the coupon itself, and the cancellation policy placed under
-- "Payment Policy" instead of after the sign-off. Nothing of the existing text
-- changes. It is only touched if nobody has edited it since this was written.

-- ── 1. Treatment cancellation (client) ─────────────────────────────────────
insert into public.email_templates (template_key, label, category, description, subject, heading, body_html, enabled)
values (
  'treatment_cancelled',
  'Treatment cancellation',
  'cancellation',
  'Sent to the client when their treatment appointment is cancelled (only if they had received a confirmation). {{details}} lists what was cancelled and the fee; {{cancel_note}} says when their request reached us and what is charged; {{policy}} is the cancellation policy.',
  'Your Holis Wellness appointment was cancelled ({{reservation_id}})',
  'Appointment Cancelled',
  '<p style="font-size:15px;margin:0 0 16px;">Dear {{guest_name}},</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 18px;">Your appointment has been cancelled. Here is what was cancelled:</p>
{{details}}
{{cancel_note}}
<p style="font-size:13px;line-height:1.6;margin:18px 0 0;color:#555;">We would love to see you another time — reply to this email or message us on WhatsApp and we will find you a new slot.</p>
{{policy}}',
  true
)
on conflict (template_key) do nothing;

-- ── 2. Website account ready (client) ──────────────────────────────────────
insert into public.email_templates (template_key, label, category, description, subject, heading, body_html, enabled)
values (
  'account_welcome',
  'Website account — welcome',
  'account',
  'Sent when the team creates a website account for a client in Admin → Clients. {{button}} is the "Choose my password" button — the client picks their own password; nobody on the team ever knows it.',
  'Your Holis Wellness account is ready',
  'Your Holis account is ready',
  '<p style="font-size:15px;margin:0 0 14px;">Hi {{first_name}},</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 14px;">We''ve created your account on spaholis.com. Choose a password and you''re in — you''ll see your memberships, passes and bookings, and book classes and treatments in a couple of taps.</p>
<p style="text-align:center;margin:24px 0;">{{button}}</p>
<p class="fine" style="font-size:13px;line-height:1.6;color:#555;margin:0;">The link works once and expires after a while. If it has, go to spaholis.com, press "Sign in" and "Forgot password" with this email address.</p>',
  true
)
on conflict (template_key) do nothing;

-- ── 3. Treatment confirmation: the whole sum, and the policy in its place ──
update public.email_templates
   set body_html = replace(replace(replace(body_html,
         '📍 <strong>Location:</strong> Holis Wellness Center<br>',
         '🔖 <strong>Reservation:</strong> {{reservation_id}}<br>' || chr(10) ||
         '📍 <strong>Location:</strong> Holis Wellness Center<br>'),
         '🕓 <strong>Time:</strong> {{time}}<br>' || chr(10) || '💳',
         '🕓 <strong>Time:</strong> {{time}}<br>' || chr(10) ||
         '💵 <strong>Service price:</strong> {{service_price}}<br>' || chr(10) ||
         '🏷️ <strong>Coupon:</strong> {{coupon_code}}<br>' || chr(10) || '💳'),
         'no-show policy.</p>' || chr(10),
         'no-show policy.</p>' || chr(10) || '{{policy}}' || chr(10)),
       updated_at = now()
 where template_key = 'treatment_confirmation'
   and md5(body_html) = '670062c1b34af0607a80bee10bc54289';
