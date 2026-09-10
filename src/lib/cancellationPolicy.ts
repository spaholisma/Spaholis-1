/**
 * The cancellation policy, in one place.
 *
 * This is the same text the guest accepts when they hand over a card at the end
 * of the booking flow, so it must not drift: what they signed and what the email
 * later tells them have to be the same sentence. `supabase/functions/
 * send-booking-notification/index.ts` keeps a mirror of POLICY_LINES for the
 * emails — Deno cannot import from src/, so change both together.
 *
 * The window is measured against the APPOINTMENT, never against the moment the
 * booking was made: a guest who books three months ahead still has until the day
 * before their visit to call it off.
 */

/** Hours before the appointment after which a cancellation costs money. */
export const FREE_CANCELLATION_HOURS = 24;

/** Charged when a guest cancels inside the window. */
export const LATE_CANCELLATION_PERCENT = 50;

/** Charged when a guest simply does not turn up. */
export const NO_SHOW_PERCENT = 100;

/** The full paragraph shown on the card-authorization step. */
export const CANCELLATION_POLICY =
  "Cancellations or changes must be made 24 hours before the appointment, or a 50% charge will apply. " +
  "The no-show fee is 100% of the total amount of your appointment or class. " +
  "By filling out this form, there is no charge in advance for the treatment. " +
  "This form will be used for further reservations during your visit if necessary.";

/** The same policy broken into the bullets the emails render. */
export const POLICY_LINES = [
  `Cancel more than ${FREE_CANCELLATION_HOURS} hours before your appointment — no charge.`,
  `Cancel within ${FREE_CANCELLATION_HOURS} hours of your appointment — ${LATE_CANCELLATION_PERCENT}% of the total is charged to the card on file.`,
  `Not showing up — ${NO_SHOW_PERCENT}% of the total is charged to the card on file.`,
  "To change the treatment, the date or the time, contact us on WhatsApp or by email — changes are not made online.",
];

/**
 * How a cancellation made right now would be treated.
 *
 * `startsAt` is the appointment instant. A booking with no start_time (an
 * at-location visit, say) falls back to the date + time columns.
 */
export function cancellationOutcome(startsAt: Date | string | number, now: Date = new Date()) {
  const start = new Date(startsAt);
  const hoursUntil = (start.getTime() - now.getTime()) / 3_600_000;
  const isLate = hoursUntil < FREE_CANCELLATION_HOURS;
  return {
    hoursUntil,
    isLate,
    /** Percentage of the total that will be charged. */
    feePercent: isLate ? LATE_CANCELLATION_PERCENT : 0,
  };
}

/** The fee in dollars, rounded to cents. */
export function cancellationFee(total: number | null | undefined, feePercent: number): number {
  const t = Number(total ?? 0);
  if (!Number.isFinite(t) || t <= 0 || feePercent <= 0) return 0;
  return Math.round(t * (feePercent / 100) * 100) / 100;
}
