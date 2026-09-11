import { HOLIS_EMAIL } from "@/data/contact";

/**
 * The cancellation policy, in one place.
 *
 * This is the same text the guest accepts when they hand over a card at the end
 * of the booking flow, so it must not drift: what they signed and what the email
 * later tells them have to be the same sentence. `supabase/functions/
 * send-booking-notification/index.ts` keeps a mirror of POLICY_LINES and of the
 * cancellation email for the emails — Deno cannot import from src/, so change
 * both together.
 *
 * The clock starts when the booking is PLACED, not at the appointment: a guest
 * has 24 hours from booking in which a cancellation costs half, and after that
 * it costs the full amount. There is no free cancellation.
 *
 * Nothing is cancelled online. A guest cancels by emailing the studio, and the
 * time that email arrives is the time of the cancellation — reception reads it
 * against the "Booked on" line of their own booking email and charges from
 * there.
 */

/** Where cancellation emails go. */
export const CANCELLATION_EMAIL = HOLIS_EMAIL;

/** Hours after placing a booking during which a cancellation costs half. */
export const HALF_CHARGE_WINDOW_HOURS = 24;

/** Charged for a cancellation inside the first 24 hours. */
export const WITHIN_WINDOW_PERCENT = 50;

/** Charged for a cancellation after that, and for a no-show. */
export const AFTER_WINDOW_PERCENT = 100;

/** The full paragraph shown on — and stored with — the card authorization. */
export const CANCELLATION_POLICY =
  "Cancellations made within 24 hours of placing this booking are charged 50% of the total. " +
  "After those first 24 hours, cancellations and no-shows are charged 100% of the total amount of your appointment. " +
  `To cancel, email us at ${CANCELLATION_EMAIL}; the time your email reaches us is the time of the cancellation. ` +
  "By filling out this form, there is no charge in advance for the treatment. " +
  "This form will be used for further reservations during your visit if necessary.";

/** The same policy broken into the bullets the emails and the dashboard render. */
export const POLICY_LINES = [
  `Cancel within ${HALF_CHARGE_WINDOW_HOURS} hours of making your booking — ${WITHIN_WINDOW_PERCENT}% of the total is charged to the card on file.`,
  `Cancel after those first ${HALF_CHARGE_WINDOW_HOURS} hours, or not show up — ${AFTER_WINDOW_PERCENT}% of the total is charged to the card on file.`,
  `To cancel, email us at ${CANCELLATION_EMAIL}. The time your email reaches us is the time of the cancellation.`,
  "To change the treatment, the date or the time, contact us on WhatsApp or by email.",
];

/** Classes follow the rule published on the Refund page, not the treatment one. */
export const CLASS_POLICY_LINES = [
  "Single class bookings may be cancelled up to 4 hours before the class.",
  "Class passes and memberships are non-refundable once activated, but remain valid for their original duration.",
];

/**
 * Until when a cancellation costs half.
 *
 * The window is 24 hours from the moment the booking was placed — but never
 * past the start of the appointment itself. Someone who books at 9am for 2pm
 * the same day cannot "cancel at 50%" at 5pm: by then they simply did not come,
 * which is a no-show and costs the full amount.
 */
export function cancellationWindow(
  bookedAt: Date | string | number,
  startsAt?: Date | string | number | null,
  now: Date = new Date(),
) {
  const booked = new Date(bookedAt).getTime();
  let endsAt = booked + HALF_CHARGE_WINDOW_HOURS * 3_600_000;
  if (startsAt != null) endsAt = Math.min(endsAt, new Date(startsAt).getTime());
  const withinWindow = now.getTime() < endsAt;
  return {
    endsAt: new Date(endsAt),
    withinWindow,
    /** Percentage a cancellation sent right now would be charged. */
    percent: withinWindow ? WITHIN_WINDOW_PERCENT : AFTER_WINDOW_PERCENT,
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
