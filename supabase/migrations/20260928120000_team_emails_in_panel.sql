-- Client Emails: the emails the team receives are editable too.
--
-- Every email to a client already came from Admin → Client Emails. The ones to
-- the team (info@spaholis.com, with a backup copy to spaholisma@gmail.com) were
-- written in the functions, so nobody could change a subject or a heading
-- without a developer. They get templates here holding exactly what they send
-- today, word for word, in a new "team" category. The functions read them and
-- fall back to the same built-in text if one is ever switched off.
--
-- The tables of booking data ({{details}}, {{agenda}}, …) are always built by
-- the functions from the real booking — the template decides the subject, the
-- heading and the words around them. Nothing is overwritten if it exists.

insert into public.email_templates (template_key, label, category, description, subject, heading, body_html, enabled) values
(
  'team_new_treatment', 'New treatment reservation', 'team',
  'To the team for every confirmed treatment booking. {{details}} is the reservation table (client, contact, date, price, coupon, when the 50% cancellation ends); {{intake}} is the therapy intake form when there is one.',
  'New Reservation — {{service_name}} — {{guest_name}} ({{reservation_id}})',
  'New Reservation Confirmed',
  '<h3 style="color:#2F2F2F;font-size:16px;margin:0 0 10px;">Reservation Details</h3>
{{details}}
{{intake}}',
  true
),
(
  'team_new_class', 'New class booking', 'team',
  'To the team for every class booking. {{guest_label}} is the name, or "3 spots (name)" for a group; {{details}} is the booking table.',
  'New Class Booking — {{class_title}} — {{guest_label}} ({{reservation_id}})',
  'New Class Booking',
  '{{details}}',
  true
),
(
  'team_treatment_cancelled', 'Treatment cancelled — amount to charge', 'team',
  'To the team when a treatment is cancelled. {{charge_label}} adds " (charge $X)" to the subject when there is a fee; {{charge_note}} says what to charge the card; {{override_note}} appears when the fee chosen differs from the policy; {{guest_notice}} says whether the guest was emailed.',
  'Cancelled{{charge_label}} — {{service_name}} — {{guest_name}} ({{reservation_id}})',
  'Booking Cancelled',
  '{{details}}
{{charge_note}}
{{override_note}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">{{guest_notice}}</p>',
  true
),
(
  'team_request_notice', 'Reservation or request notice', 'team',
  'To the team for a walk-in added in the calendar, a custom-retreat request from the website, and course or studio-rental information requests. {{kind}} is "Reservation" or "Retreat Inquiry".',
  'New {{kind}}: {{service_name}} — {{guest_name}}',
  'New {{kind}}',
  '{{details}}
{{intake}}',
  true
),
(
  'team_offering_order', 'New membership order (from the Admin)', 'team',
  'To the team when a membership or pass is ordered from the Admin. {{order_details}} is the code and the scheduling link.',
  '[New order] {{guest_name}} — {{offering_name}} ({{code}})',
  'New membership order',
  '<p><strong>Customer:</strong> {{customer_name}} &lt;{{email}}&gt;</p>
<p><strong>Offering:</strong> {{offering_name}}</p>
{{order_details}}',
  true
),
(
  'team_offering_purchase', 'New membership/pass purchase (paid online)', 'team',
  'To the team when a membership or pass is bought and paid on the website. {{order_details}} is the code and the scheduling link.',
  '[Purchase] {{guest_name}} — {{offering_name}}{{code_suffix}}',
  'New membership/pass purchase (paid online)',
  '<p><strong>Customer:</strong> {{customer_name}} &lt;{{email}}&gt;</p>
<p><strong>Offering:</strong> {{offering_name}}</p>
{{order_details}}',
  true
),
(
  'team_retreat_inquiry', 'Retreat inquiry', 'team',
  'To the team when someone sends the form on a retreat''s page. Replying goes straight to the guest. {{details}} is what they filled in; {{message}} their message.',
  'New retreat inquiry — {{retreat_title}} · {{guest_name}}',
  'New retreat inquiry',
  '{{details}}
{{message}}
<p class="foot" style="margin:22px 0 0;color:#7a7a72;font-size:12px;line-height:1.5">Reply to this email to answer the guest directly.
Update the status in <a href="https://www.spaholis.com/admin" style="color:#5e7d67">Admin</a>.</p>',
  true
),
(
  'team_custom_retreat', 'Custom retreat request', 'team',
  'To the team when someone sends the custom-retreat form. Replying goes straight to the guest. {{details}} is what they filled in; {{message}} their special requests.',
  'New custom retreat request — {{guest_name}}',
  'Custom retreat request',
  '{{details}}
{{message}}
<p class="foot" style="margin:22px 0 0;color:#7a7a72;font-size:12px;line-height:1.5">Reply to this email to answer the guest directly.
Update the status in <a href="https://www.spaholis.com/admin" style="color:#5e7d67">Admin</a>.</p>',
  true
),
(
  'team_daily_agenda', 'Tomorrow''s agenda (every evening)', 'team',
  'To the team every evening. {{agenda}} is the two tables — website bookings and calendar entries for tomorrow; {{bookings_count}} and {{entries_count}} are how many of each.',
  'Agenda mañana — {{date}} ({{bookings_count}} reservas)',
  'Tomorrow''s Agenda — {{date}}',
  '{{agenda}}',
  true
)
on conflict (template_key) do nothing;
