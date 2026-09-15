import { HOLIS_EMAIL } from "@/data/contact";
import { spaLocalToInstant } from "@/lib/businessHours";

/**
 * The cancellation policy, in one place.
 *
 * This is the same text the guest accepts when they hand over a card at the end
 * of the booking flow, so it must not drift: what they signed and what the email
 * later tells them have to be the same sentence. `supabase/functions/
 * send-booking-notification/index.ts` keeps a mirror of these lines and of the
 * cancellation email — Deno cannot import from src/, so change both together.
 *
 * The clock runs against the APPOINTMENT: cancelling more than 48 hours before
 * it costs half, and inside those 48 hours — or not coming — costs the full
 * amount. There is no free cancellation. A guest who books less than 48 hours
 * ahead is inside the window from the moment they book.
 *
 * Nothing is cancelled online. A guest cancels by emailing the studio, and the
 * time that email arrives is the time of the cancellation — reception reads it
 * against the appointment and picks the fee in the calendar.
 */

/** Where cancellation emails go. */
export const CANCELLATION_EMAIL = HOLIS_EMAIL;

/** Hours before the appointment from which a cancellation costs the full amount. */
export const FULL_CHARGE_WINDOW_HOURS = 48;

/** Charged for a cancellation made more than 48 hours before the appointment. */
export const BEFORE_WINDOW_PERCENT = 50;

/** Charged inside the 48 hours before the appointment, and for a no-show. */
export const WITHIN_WINDOW_PERCENT = 100;

/** The full paragraph shown on — and stored with — the card authorization. */
export const CANCELLATION_POLICY =
  "Cancellations made more than 48 hours before the appointment are charged 50% of the total. " +
  "Cancellations within the 48 hours before the appointment, and no-shows, are charged 100% of the total amount of your appointment. " +
  `To cancel, email us at ${CANCELLATION_EMAIL} — your confirmation email has a button that writes it for you — ` +
  "and the time your email reaches us is the time of the cancellation. " +
  "By filling out this form, there is no charge in advance for the treatment. " +
  "This form will be used for further reservations during your visit if necessary.";

/** What each cancellation costs. */
export const RULE_LINES = [
  `Cancel more than ${FULL_CHARGE_WINDOW_HOURS} hours before your appointment — ${BEFORE_WINDOW_PERCENT}% of the total is charged to the card on file.`,
  `Cancel within the ${FULL_CHARGE_WINDOW_HOURS} hours before your appointment, or not show up — ${WITHIN_WINDOW_PERCENT}% of the total is charged to the card on file.`,
];

/** How to cancel. */
export const HOW_TO_CANCEL_LINE =
  `To cancel, email us at ${CANCELLATION_EMAIL}. The time your email reaches us is the time of the cancellation.`;

/** How to change instead. */
export const CHANGES_LINE = "To change the treatment, the date or the time, contact us on WhatsApp or by email.";

/** The whole policy as the bullets the emails and the dashboard render. */
export const POLICY_LINES = [...RULE_LINES, HOW_TO_CANCEL_LINE, CHANGES_LINE];

/** Classes follow the rule published on the Refund page, not the treatment one. */
export const CLASS_POLICY_LINES = [
  "Single class bookings may be cancelled up to 4 hours before the class.",
  "Class passes and memberships are non-refundable once activated, but remain valid for their original duration.",
];

/** The appointment instant: start_time when there is one, otherwise the date
 *  and wall clock, which are stored in spa-local time (at-location visits). */
export function appointmentStart(b: {
  start_time?: string | null;
  booking_date: string;
  booking_time?: string | null;
}): Date {
  if (b.start_time) return new Date(b.start_time);
  const [y, m, d] = b.booking_date.split("-").map(Number);
  const [h, min] = (b.booking_time || "00:00").split(":").map(Number);
  return spaLocalToInstant(y, m - 1, d, h || 0, min || 0);
}

/**
 * What a cancellation sent right now would cost.
 *
 * `fullChargeFrom` is 48 hours before the appointment: an email that reaches
 * the studio before then is charged half, one that arrives after it — or no
 * email at all and no guest — the full amount.
 */
export function cancellationWindow(startsAt: Date | string | number, now: Date = new Date()) {
  const start = new Date(startsAt).getTime();
  const fullChargeFrom = new Date(start - FULL_CHARGE_WINDOW_HOURS * 3_600_000);
  const withinWindow = now.getTime() >= fullChargeFrom.getTime();
  return {
    fullChargeFrom,
    /** True once the 48 hours before the appointment have begun. */
    withinWindow,
    /** Percentage a cancellation sent right now would be charged. */
    percent: withinWindow ? WITHIN_WINDOW_PERCENT : BEFORE_WINDOW_PERCENT,
  };
}

/** The fee in dollars, rounded to cents. */
export function cancellationFee(total: number | null | undefined, percent: number): number {
  const t = Number(total ?? 0);
  if (!Number.isFinite(t) || t <= 0 || percent <= 0) return 0;
  return Math.round(t * (percent / 100) * 100) / 100;
}

/** The short id guests and reception both quote — same as in the emails. */
export function reservationCode(bookingId: string): string {
  return bookingId.slice(0, 8).toUpperCase();
}

/**
 * A mailto: link that opens a cancellation email already addressed to the
 * studio, with the appointment filled in, so the guest only writes a line.
 *
 * Mirrored as buildCancellationMailto() in the edge function; the two must
 * produce the same email.
 */
export function buildCancellationMailto(b: {
  serviceName: string;
  date: string;
  time: string;
  reservationId: string;
  guestName?: string | null;
}): string {
  const subject = `Cancellation request — ${b.serviceName} — ${b.reservationId}`;
  const body = [
    "Hello Holis team,",
    "",
    "I would like to cancel my appointment.",
    "",
    `Service: ${b.serviceName}`,
    `Date: ${b.date}`,
    `Time: ${b.time}`,
    `Reservation: ${b.reservationId}`,
    ...(b.guestName ? [`Name: ${b.guestName}`] : []),
    "",
    "My message:",
    "",
  ].join("\r\n");
  return `mailto:${CANCELLATION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
