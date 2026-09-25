// When a class can be booked online.
//
// Up to the moment it starts — no earlier cutoff (it used to close 15 minutes
// before). The database holds to the same rule (reject_past_class_booking), and
// the payment functions check it when a payment begins, so a payment started
// before the class is always honoured even if it completes a few seconds after.
// The team can still add someone in the Admin at any time.

export function isClassOpenForBooking(startIso: string | Date, now: number = Date.now()): boolean {
  return new Date(startIso).getTime() > now;
}

export const CLASS_BOOKING_CLOSED_MESSAGE = "This class has already started — online booking is closed.";

/** A friendly line for the reasons a class checkout can be refused. */
export function classCheckoutReasonMessage(reason: string | null | undefined): string | null {
  switch (reason) {
    case "class_started": return CLASS_BOOKING_CLOSED_MESSAGE;
    case "class_full": return "This class just filled up.";
    case "class_day_closed": return "The studio is closed that day.";
    case "class_unavailable": return "This class is no longer available.";
    default: return null;
  }
}
