// deno-lint-ignore-file no-explicit-any
// Edge function: send-booking-notification
//
// Sends confirmation emails for a completed reservation:
//   1. Admin notification email → spaholisma@gmail.com
//   2. Customer confirmation email → guest_email
//
// TWO INVOCATION MODES:
//
// A) Preferred DB-driven mode (used by finalize-booking, bac-webhook,
//    and non-payment flows):
//       body: { bookingId: "<uuid>" }
//    We load the booking from Postgres, gate on a *confirmed* status
//    (paid | pending | confirmed | completed), and atomically claim
//    `notification_sent_at` so retries/webhook races cannot duplicate
//    the emails.
//
// B) Legacy raw-payload mode (kept for admin walk-in modal and other
//    already-confirmed flows that still pass a hand-built object).
//    No dedup — callers must not use this for payment-gated flows.
//
// This function NEVER sends emails for pending_payment, payment_failed,
// cancelled, or otherwise incomplete bookings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRMED_STATUSES = new Set(["paid", "pending", "confirmed", "completed"]);
const ADMIN_EMAIL = "info@spaholis.com";
const ADMIN_BACKUP_EMAIL = "spaholisma@gmail.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";

// Prices are stored in the database in USD (see the CRC → USD reversion
// migration). This function renders and reasons about them as dollars.
const usdFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const formatCRC = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? `$${usdFmt.format(n)}` : "$0.00";
};
const formatUsdRef = (_v: unknown) => "";

function isFacialService(service: { title?: string | null; category?: string | null } | null | undefined) {
  const title = (service?.title || "").toLowerCase();
  const category = (service?.category || "").toLowerCase();
  return category.includes("facial") || title.includes("facial") || title.includes("cosmolifting");
}

// Deposit amounts are already in USD everywhere — no CRC conversion.
function depositUsd(service: any): number {
  return isFacialService(service) ? 10 : 20;
}


function tableRow(label: string, value: string) {
  return `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;width:40%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`;
}

// ---- Editable customer templates (public.email_templates) -----------------
// The admin "Client Emails" panel edits subject/heading/body for the customer
// confirmation emails. We load the row, interpolate {{variables}}, and wrap the
// body in the branded shell. Missing/disabled → built-in copy below. Admin
// notification emails are internal and stay hard-coded.
type Template = { subject: string; heading: string; body_html: string };

async function loadTemplate(supabase: any, key: string): Promise<Template | null> {
  try {
    const { data } = await supabase
      .from("email_templates")
      .select("subject, heading, body_html, enabled")
      .eq("template_key", key)
      .maybeSingle();
    if (!data || data.enabled === false) return null;
    return { subject: data.subject, heading: data.heading, body_html: data.body_html };
  } catch (_e) {
    return null;
  }
}

const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

function renderShell(heading: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:28px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">${heading}</h1>
      </div>
      <div style="padding:28px;color:#2F2F2F;">${inner}</div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center · spaholis.com
      </div>
    </div>
  </body></html>`;
}

// textVars are HTML-escaped; rawVars ({{details}}, {{button}}) are trusted HTML.
function buildFromTemplate(
  tpl: Template,
  textVars: Record<string, string>,
  rawVars: Record<string, string>,
): { subject: string; html: string } {
  const vars: Record<string, string> = { ...rawVars };
  for (const [k, v] of Object.entries(textVars)) vars[k] = escHtml(v);
  return {
    subject: interpolate(tpl.subject, vars),
    html: renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars)),
  };
}

function detailsTable(rows: string[]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>`;
}

function whatsappButton(url: string): string {
  return `<p style="margin:0;"><a href="${url}" style="display:inline-block;background:#25D366;color:#ffffff;padding:10px 18px;border-radius:6px;font-size:14px;text-decoration:none;">Message us on WhatsApp</a></p>`;
}

function buildAdminHtml(ctx: {
  reservationId: string;
  serviceName: string;
  therapist: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  bookingDate: string;
  bookingTime: string;
  totalPrice: number | null;
  depositPaid: number | null;
  remainingBalance: number | null;
  paymentStatus: string;
  paymentId: string | null;
  notes: string | null;
  intakeHtml: string;
}) {
  const rows: string[] = [];
  rows.push(tableRow("Reservation ID", ctx.reservationId));
  rows.push(tableRow("Service", ctx.serviceName));
  if (ctx.therapist) rows.push(tableRow("Therapist", ctx.therapist));
  rows.push(tableRow("Client Name", ctx.guestName));
  rows.push(tableRow("Email", ctx.guestEmail));
  rows.push(tableRow("Phone", ctx.guestPhone || "Not provided"));
  rows.push(tableRow("Date", ctx.bookingDate));
  rows.push(tableRow("Time", ctx.bookingTime));
  rows.push(tableRow("Payment Status", ctx.paymentStatus));
  if (ctx.totalPrice != null) rows.push(tableRow("Total Price", `${formatCRC(ctx.totalPrice)}${formatUsdRef(ctx.totalPrice)}`));
  if (ctx.depositPaid != null) rows.push(tableRow("Deposit Paid", `${formatCRC(ctx.depositPaid)}${formatUsdRef(ctx.depositPaid)}`));
  if (ctx.remainingBalance != null) rows.push(tableRow("Remaining Balance Due", `${formatCRC(ctx.remainingBalance)}${formatUsdRef(ctx.remainingBalance)}`));
  if (ctx.paymentId) rows.push(tableRow("Payment ID", ctx.paymentId));
  if (ctx.notes) rows.push(tableRow("Customer Notes", ctx.notes));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:24px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">New Reservation Confirmed</h1>
      </div>
      <div style="padding:24px;">
        <h3 style="color:#2F2F2F;font-size:16px;margin:0 0 10px;">Reservation Details</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
        ${ctx.intakeHtml}
      </div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center — Reservation Notification
      </div>
    </div>
  </body></html>`;
}

function buildCustomerHtml(ctx: {
  reservationId: string;
  serviceName: string;
  therapist: string | null;
  guestName: string;
  bookingDate: string;
  bookingTime: string;
  totalPrice: number | null;
  depositPaid: number | null;
  remainingBalance: number | null;
  paymentStatus: string;
}) {
  const rows: string[] = [];
  rows.push(tableRow("Reservation ID", ctx.reservationId));
  rows.push(tableRow("Service", ctx.serviceName));
  if (ctx.therapist) rows.push(tableRow("Therapist", ctx.therapist));
  rows.push(tableRow("Date", ctx.bookingDate));
  rows.push(tableRow("Time", ctx.bookingTime));
  rows.push(tableRow("Payment Status", ctx.paymentStatus));
  if (ctx.totalPrice != null) rows.push(tableRow("Total", `${formatCRC(ctx.totalPrice)}${formatUsdRef(ctx.totalPrice)}`));
  if (ctx.depositPaid != null) rows.push(tableRow("Deposit Paid", `${formatCRC(ctx.depositPaid)}${formatUsdRef(ctx.depositPaid)}`));
  if (ctx.remainingBalance != null && ctx.remainingBalance > 0)
    rows.push(tableRow("Balance Due at Visit", `${formatCRC(ctx.remainingBalance)}${formatUsdRef(ctx.remainingBalance)}`));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:28px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">Your Reservation is Confirmed</h1>
      </div>
      <div style="padding:28px;color:#2F2F2F;">
        <p style="font-size:15px;margin:0 0 16px;">Dear ${ctx.guestName},</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 18px;">
          Thank you for booking with Holis Wellness Center. We've confirmed the details of your reservation below.
          If anything looks incorrect, reply to this email and our team will assist you.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
        <p style="font-size:13px;line-height:1.6;margin:22px 0 0;color:#555;">
          We look forward to welcoming you. Please arrive 10 minutes early to settle in.
        </p>
      </div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center · spaholis.com
      </div>
    </div>
  </body></html>`;
}

function buildIntakeHtml(intake: any): string {
  if (!intake || typeof intake !== "object") return "";
  const f = intake.is_couples ? intake.person1 ?? {} : intake;
  return `
    <h3 style="color:#2F2F2F;font-size:16px;margin:20px 0 10px;">Therapy Intake Form</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${tableRow("Allergies", f.allergies || "None")}
      ${tableRow("Medications", f.medications || "None")}
      ${tableRow("Health Conditions", f.health_conditions || f.medical_conditions || "None")}
      ${tableRow("Recent Surgeries", f.recent_surgeries || "None")}
      ${tableRow("Pregnant", f.pregnancy ? "Yes" : "No")}
      ${tableRow("Blood Pressure Issues", f.blood_pressure_issues ? "Yes" : "No")}
      ${tableRow("Skin Conditions", f.skin_conditions || "None")}
      ${tableRow("Emergency Contact", `${f.emergency_contact_name ?? "—"} — ${f.emergency_contact_phone ?? "—"}`)}
      ${tableRow("Additional Notes", f.additional_notes || "None")}
    </table>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  // Email is sent via Resend (independent of Lovable). Requires the
  // RESEND_API_KEY Supabase secret and the sending domain (spaholis.com)
  // verified in Resend so FROM_ADDRESS is accepted.
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { ok: false, error: "email_config_missing" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

async function handleByBookingId(bookingId: string, supabase: any): Promise<Response> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`
      id, status, guest_name, guest_email, guest_phone, booking_date, booking_time,
      notes, total_price, payment_id, notification_sent_at, intake_form,
      service:services(id, title, category),
      staff:staff(id, name)
    `)
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    console.error("[send-booking-notification] fetch error", error);
    return new Response(JSON.stringify({ ok: false, reason: "fetch_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!booking) {
    return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!CONFIRMED_STATUSES.has(String(booking.status))) {
    console.log(`[send-booking-notification] skipping status=${booking.status}`);
    return new Response(JSON.stringify({ ok: true, skipped: "not_confirmed", status: booking.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- Atomic claim to prevent duplicate sends (webhook + return callback race) ----
  const { data: claimed } = await supabase
    .from("bookings")
    .update({ notification_sent_at: new Date().toISOString() })
    .eq("id", booking.id)
    .is("notification_sent_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    console.log(`[send-booking-notification] already sent for ${booking.id}`);
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const service = booking.service ?? null;
  const serviceName = service?.title || "Reservation";
  const therapist = booking.staff?.name || null;

  // Booking totals are already stored in USD.
  const totalUsd = booking.total_price != null ? Number(booking.total_price) : null;
  const isPaid = booking.status === "paid";
  const isPendingPayment = false; // filtered above
  const paymentStatusLabel =
    booking.status === "paid" ? "Deposit Paid — Balance Due at Visit"
    : booking.status === "completed" ? "Fully Paid"
    : booking.status === "confirmed" ? "Confirmed"
    : "Pending confirmation from staff";

  let depositPaid: number | null = null;
  let remaining: number | null = null;
  if (isPaid && service) {
    depositPaid = depositUsd(service);
    if (totalUsd != null) remaining = Math.max(0, totalUsd - depositPaid);
  }

  const reservationId = booking.id.slice(0, 8).toUpperCase();
  const bookingDate = new Date(`${booking.booking_date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const bookingTime = (booking.booking_time || "").slice(0, 5) || "TBD";

  const adminHtml = buildAdminHtml({
    reservationId,
    serviceName,
    therapist,
    guestName: booking.guest_name || "Guest",
    guestEmail: booking.guest_email || "N/A",
    guestPhone: booking.guest_phone || "",
    bookingDate,
    bookingTime,
    totalPrice: totalUsd,
    depositPaid,
    remainingBalance: remaining,
    paymentStatus: paymentStatusLabel,
    paymentId: booking.payment_id ?? null,
    notes: booking.notes ?? null,
    intakeHtml: buildIntakeHtml(booking.intake_form),
  });

  const adminSubj = `New Reservation — ${serviceName} — ${booking.guest_name || "Guest"} (${reservationId})`;
  const adminRes = await sendEmail(ADMIN_EMAIL, adminSubj, adminHtml);
  if (!adminRes.ok) console.error("[send-booking-notification] admin email failed:", adminRes.error);
  // Backup copy to Gmail so the team keeps a durable off-domain archive.
  const backupRes = await sendEmail(ADMIN_BACKUP_EMAIL, `[Backup] ${adminSubj}`, adminHtml);
  if (!backupRes.ok) console.error("[send-booking-notification] backup email failed:", backupRes.error);

  let customerRes: { ok: boolean; error?: string } = { ok: true };
  if (booking.guest_email) {
    // Prefer the admin-editable template; fall back to the built-in layout.
    const tpl = await loadTemplate(supabase, "treatment_confirmation");
    let subject: string;
    let customerHtml: string;
    if (tpl) {
      const rows: string[] = [];
      rows.push(tableRow("Reservation ID", escHtml(reservationId)));
      rows.push(tableRow("Service", escHtml(serviceName)));
      if (therapist) rows.push(tableRow("Therapist", escHtml(therapist)));
      rows.push(tableRow("Date", escHtml(bookingDate)));
      rows.push(tableRow("Time", escHtml(bookingTime)));
      rows.push(tableRow("Payment Status", escHtml(paymentStatusLabel)));
      if (totalUsd != null) rows.push(tableRow("Total", formatCRC(totalUsd)));
      if (depositPaid != null) rows.push(tableRow("Deposit Paid", formatCRC(depositPaid)));
      if (remaining != null && remaining > 0) rows.push(tableRow("Balance Due at Visit", formatCRC(remaining)));
      const built = buildFromTemplate(
        tpl,
        {
          guest_name: booking.guest_name || "Guest",
          reservation_id: reservationId,
          service_name: serviceName,
          therapist: therapist || "",
          date: bookingDate,
          time: bookingTime,
          payment_status: paymentStatusLabel,
        },
        { details: detailsTable(rows), button: "" },
      );
      subject = built.subject;
      customerHtml = built.html;
    } else {
      subject = `Your Holis Wellness reservation is confirmed (${reservationId})`;
      customerHtml = buildCustomerHtml({
        reservationId,
        serviceName,
        therapist,
        guestName: booking.guest_name || "Guest",
        bookingDate,
        bookingTime,
        totalPrice: totalUsd,
        depositPaid,
        remainingBalance: remaining,
        paymentStatus: paymentStatusLabel,
      });
    }
    customerRes = await sendEmail(booking.guest_email, subject, customerHtml);
    if (!customerRes.ok) console.error("[send-booking-notification] customer email failed:", customerRes.error);
  }

  // If both failed, release the claim so a manual retry can resend.
  if (!adminRes.ok && !customerRes.ok) {
    await supabase.from("bookings").update({ notification_sent_at: null }).eq("id", booking.id);
    return new Response(JSON.stringify({ ok: false, reason: "delivery_failed" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, adminSent: adminRes.ok, customerSent: customerRes.ok }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------------
// Class bookings (paid via PayPal or via a membership/credit redemption).
//
// Reads from public.class_bookings joined to class_schedule + classes so the
// email + WhatsApp CTA render the true DB-stored USD `total_price` (never a
// value passed in by the client). Deduplicates on `notification_sent_at` the
// same way handleByBookingId does for treatments.
// -----------------------------------------------------------------------------

// Canonical WhatsApp number for the Holis team. Kept in sync with
// src/data/contact.ts:HOLIS_PHONE_E164_DIGITS.
export const HOLIS_WHATSAPP_DIGITS = "50685912066";

/** Build the class-booking WhatsApp CTA URL used in the customer email.
 *  Exported so tests can assert USD amount encoding for every payment path. */
export function buildClassWhatsAppUrl(opts: {
  className: string;
  reservationId: string;
  totalUsd: number | null;
}): string {
  const waAmount =
    opts.totalUsd != null && opts.totalUsd > 0 ? ` (${formatCRC(opts.totalUsd)})` : "";
  const msg = encodeURIComponent(
    `Hi Holis! Regarding my class booking "${opts.className}"${waAmount} — reservation ${opts.reservationId}.`,
  );
  return `https://wa.me/${HOLIS_WHATSAPP_DIGITS}?text=${msg}`;
}

export { formatCRC };

export function buildClassCustomerHtml(ctx: {
  reservationId: string;
  className: string;
  instructor: string | null;
  guestName: string;
  scheduleLabel: string;
  location: string | null;
  totalPrice: number | null;
  paymentStatus: string;
  whatsappUrl: string;
}) {
  const rows: string[] = [];
  rows.push(tableRow("Reservation ID", ctx.reservationId));
  rows.push(tableRow("Class", ctx.className));
  if (ctx.instructor) rows.push(tableRow("Instructor", ctx.instructor));
  rows.push(tableRow("When", ctx.scheduleLabel));
  if (ctx.location) rows.push(tableRow("Location", ctx.location));
  rows.push(tableRow("Payment Status", ctx.paymentStatus));
  if (ctx.totalPrice != null && ctx.totalPrice > 0) {
    rows.push(tableRow("Amount Paid", formatCRC(ctx.totalPrice)));
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:28px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">Your Class is Booked</h1>
      </div>
      <div style="padding:28px;color:#2F2F2F;">
        <p style="font-size:15px;margin:0 0 16px;">Dear ${ctx.guestName},</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 18px;">
          Thanks for signing up. Your spot in ${ctx.className} is confirmed.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
        <p style="font-size:13px;line-height:1.6;margin:22px 0 12px;color:#555;">
          Please arrive 10 minutes early. Need to reach us?
        </p>
        <p style="margin:0;">
          <a href="${ctx.whatsappUrl}"
             style="display:inline-block;background:#25D366;color:#ffffff;padding:10px 18px;border-radius:6px;font-size:14px;text-decoration:none;">
            Message us on WhatsApp
          </a>
        </p>
      </div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center · spaholis.com
      </div>
    </div>
  </body></html>`;
}

export function buildClassAdminHtml(ctx: {
  reservationId: string;
  className: string;
  instructor: string | null;
  guestName: string;
  guestEmail: string;
  scheduleLabel: string;
  location: string | null;
  totalPrice: number | null;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentId: string | null;
  couponCode: string | null;
  discountAmount: number | null;
}) {
  const rows: string[] = [];
  rows.push(tableRow("Reservation ID", ctx.reservationId));
  rows.push(tableRow("Class", ctx.className));
  if (ctx.instructor) rows.push(tableRow("Instructor", ctx.instructor));
  rows.push(tableRow("Client Name", ctx.guestName));
  rows.push(tableRow("Email", ctx.guestEmail));
  rows.push(tableRow("When", ctx.scheduleLabel));
  if (ctx.location) rows.push(tableRow("Location", ctx.location));
  rows.push(tableRow("Payment Status", ctx.paymentStatus));
  if (ctx.paymentMethod) rows.push(tableRow("Payment Method", ctx.paymentMethod));
  if (ctx.totalPrice != null) rows.push(tableRow("Amount", formatCRC(ctx.totalPrice)));
  if (ctx.couponCode) rows.push(tableRow("Coupon", ctx.couponCode));
  if (ctx.discountAmount != null && ctx.discountAmount > 0) {
    rows.push(tableRow("Discount", `-${formatCRC(ctx.discountAmount)}`));
  }
  if (ctx.paymentId) rows.push(tableRow("Payment ID", ctx.paymentId));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:24px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">New Class Booking</h1>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
      </div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center — Class Booking Notification
      </div>
    </div>
  </body></html>`;
}

async function handleByClassBookingId(classBookingId: string, supabase: any): Promise<Response> {
  const { data: booking, error } = await supabase
    .from("class_bookings")
    .select(`
      id, status, payment_status, payment_method, payment_id,
      guest_name, guest_email, coupon_code, discount_amount, total_price,
      notification_sent_at, booking_group_id,
      schedule:class_schedule(
        id, start_time, end_time,
        class:classes(id, title, instructor, location, price, requires_payment)
      )
    `)
    .eq("id", classBookingId)
    .maybeSingle();

  if (error) {
    console.error("[send-booking-notification] class fetch error", error);
    return new Response(JSON.stringify({ ok: false, reason: "fetch_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!booking) {
    return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only send once the booking is genuinely confirmed. `pending_payment`
  // and `payment_failed` must never trigger a "you're booked" email.
  const confirmed = new Set(["booked", "confirmed", "completed", "paid"]);
  if (!confirmed.has(String(booking.status))) {
    console.log(`[send-booking-notification] skipping class status=${booking.status}`);
    return new Response(JSON.stringify({ ok: true, skipped: "not_confirmed", status: booking.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Atomic claim: only the first invocation for this booking wins.
  const { data: claimed } = await supabase
    .from("class_bookings")
    .update({ notification_sent_at: new Date().toISOString() })
    .eq("id", booking.id)
    .is("notification_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    console.log(`[send-booking-notification] class already sent for ${booking.id}`);
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cls: any = booking.schedule?.class ?? null;
  const className = cls?.title || "Class";
  const instructor = cls?.instructor || null;
  const location = cls?.location || null;

  // Prices are stored in USD in the DB — render as dollars, never CRC math.
  let totalUsd = booking.total_price != null ? Number(booking.total_price) : null;
  const discountUsd = booking.discount_amount != null ? Number(booking.discount_amount) : null;

  // Multi-spot booking: gather every participant so the email lists them all and
  // the amount reflects the whole party (each row stores its own per-spot price).
  let party: string[] = [];
  if (booking.booking_group_id) {
    const { data: members } = await supabase
      .from("class_bookings")
      .select("guest_name, total_price, created_at")
      .eq("booking_group_id", booking.booking_group_id)
      .order("created_at", { ascending: true });
    if (Array.isArray(members) && members.length > 1) {
      party = members.map((m: any) => (m.guest_name || "").trim()).filter(Boolean);
      totalUsd = members.reduce((sum: number, m: any) => sum + Number(m.total_price ?? 0), 0);
    }
  }
  const partyLine = party.length > 1 ? `${party.length} spots — ${party.join(", ")}` : null;

  const start = booking.schedule?.start_time ? new Date(booking.schedule.start_time) : null;
  const scheduleLabel = start
    ? start.toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
      })
    : "TBD";

  const reservationId = booking.id.slice(0, 8).toUpperCase();
  const paymentMethod = booking.payment_method || null;
  const paymentStatusLabel =
    booking.payment_status === "paid" ? "Paid"
    : paymentMethod === "membership" ? "Covered by membership"
    : paymentMethod === "credit" || paymentMethod === "credits" ? "Redeemed with credits"
    : booking.status === "booked" ? "Confirmed"
    : "Confirmed";

  // WhatsApp CTA prefilled with the correct USD amount.
  const whatsappUrl = buildClassWhatsAppUrl({ className, reservationId, totalUsd });

  const adminHtml = buildClassAdminHtml({
    reservationId,
    className,
    instructor,
    guestName: booking.guest_name || "Guest",
    guestEmail: booking.guest_email || "N/A",
    scheduleLabel,
    location,
    totalPrice: totalUsd,
    paymentStatus: paymentStatusLabel,
    paymentMethod,
    paymentId: booking.payment_id ?? null,
    couponCode: booking.coupon_code ?? null,
    discountAmount: discountUsd,
  });

  const adminSubj = `New Class Booking — ${className} — ${partyLine ? `${party.length} spots (${booking.guest_name || "Guest"})` : (booking.guest_name || "Guest")} (${reservationId})`;
  const adminRes = await sendEmail(ADMIN_EMAIL, adminSubj, adminHtml);
  if (!adminRes.ok) console.error("[send-booking-notification] class admin email failed:", adminRes.error);
  const backupRes = await sendEmail(ADMIN_BACKUP_EMAIL, `[Backup] ${adminSubj}`, adminHtml);
  if (!backupRes.ok) console.error("[send-booking-notification] class backup email failed:", backupRes.error);

  let customerRes: { ok: boolean; error?: string } = { ok: true };
  if (booking.guest_email) {
    // Prefer the admin-editable template; fall back to the built-in layout.
    const tpl = await loadTemplate(supabase, "class_confirmation");
    let subject: string;
    let customerHtml: string;
    if (tpl) {
      const rows: string[] = [];
      rows.push(tableRow("Reservation ID", escHtml(reservationId)));
      rows.push(tableRow("Class", escHtml(className)));
      if (partyLine) rows.push(tableRow("Participants", escHtml(partyLine)));
      if (instructor) rows.push(tableRow("Instructor", escHtml(instructor)));
      rows.push(tableRow("When", escHtml(scheduleLabel)));
      if (location) rows.push(tableRow("Location", escHtml(location)));
      rows.push(tableRow("Payment Status", escHtml(paymentStatusLabel)));
      if (totalUsd != null && totalUsd > 0) rows.push(tableRow("Amount Paid", formatCRC(totalUsd)));
      const built = buildFromTemplate(
        tpl,
        {
          guest_name: booking.guest_name || "Guest",
          reservation_id: reservationId,
          class_title: className,
          instructor: instructor || "",
          when: scheduleLabel,
          location: location || "",
          payment_status: paymentStatusLabel,
        },
        { details: detailsTable(rows), button: whatsappButton(whatsappUrl), whatsapp_url: whatsappUrl },
      );
      subject = built.subject;
      customerHtml = built.html;
    } else {
      subject = `Your Holis class is booked — ${className} (${reservationId})`;
      customerHtml = buildClassCustomerHtml({
        reservationId,
        className,
        instructor,
        guestName: booking.guest_name || "Guest",
        scheduleLabel,
        location,
        totalPrice: totalUsd,
        paymentStatus: paymentStatusLabel,
        whatsappUrl,
      });
    }
    customerRes = await sendEmail(booking.guest_email, subject, customerHtml);
    if (!customerRes.ok) console.error("[send-booking-notification] class customer email failed:", customerRes.error);
  }

  if (!adminRes.ok && !customerRes.ok) {
    await supabase.from("class_bookings").update({ notification_sent_at: null }).eq("id", booking.id);
    return new Response(JSON.stringify({ ok: false, reason: "delivery_failed" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, adminSent: adminRes.ok, customerSent: customerRes.ok }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleLegacyPayload(body: any): Promise<Response> {
  // Back-compat path: caller passes an already-composed payload for a
  // non-payment (already-confirmed) reservation, e.g. admin walk-in.
  const serviceName = body.service_name || body.serviceName || "Reservation";
  const guestName = body.guest_name || body.guestName || "Guest";
  const rows: string[] = [];
  rows.push(tableRow("Service", serviceName));
  rows.push(tableRow("Client Name", guestName));
  rows.push(tableRow("Email", body.guest_email || body.guestEmail || "N/A"));
  rows.push(tableRow("Phone", body.guest_phone || body.guestPhone || "Not provided"));
  rows.push(tableRow("Date", body.booking_date || body.bookingDate || "N/A"));
  rows.push(tableRow("Time", body.booking_time || body.bookingTime || "N/A"));
  if (body.location) rows.push(tableRow("Location", body.location));
  if (body.total_price) rows.push(tableRow("Total", `${formatCRC(body.total_price)}${formatUsdRef(body.total_price)}`));
  if (body.payment_id) rows.push(tableRow("Payment ID", body.payment_id));
  if (body.notes) rows.push(tableRow("Notes", body.notes));

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:24px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">${body.is_retreat ? "New Retreat Inquiry" : "New Reservation"}</h1>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
        ${buildIntakeHtml(body.intake_form)}
      </div>
    </div>
  </body></html>`;

  const subj = `New ${body.is_retreat ? "Retreat Inquiry" : "Reservation"}: ${serviceName} — ${guestName}`;
  const res = await sendEmail(ADMIN_EMAIL, subj, html);
  // Backup copy to Gmail for durable off-domain archive.
  await sendEmail(ADMIN_BACKUP_EMAIL, `[Backup] ${subj}`, html);
  return new Response(JSON.stringify({ ok: true, adminSent: res.ok, warning: res.ok ? undefined : res.error }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (typeof body.bookingId === "string" && UUID_RE.test(body.bookingId)) {
      return await handleByBookingId(body.bookingId, supabase);
    }
    if (typeof body.classBookingId === "string" && UUID_RE.test(body.classBookingId)) {
      return await handleByClassBookingId(body.classBookingId, supabase);
    }
    return await handleLegacyPayload(body);
  } catch (err) {
    console.error("[send-booking-notification] unhandled:", err);
    return new Response(JSON.stringify({ ok: true, warning: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
