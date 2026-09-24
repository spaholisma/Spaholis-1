// The class checkout's arithmetic and decisions, without the screen, so they
// can be tested.

/** What a card payment would come to: every spot, less any coupon. */
export function cardTotal(price: number, quantity: number, discount: number): number {
  return Math.max(0, Math.round((quantity * price - discount) * 100) / 100);
}

/**
 * A coupon that covers the whole class leaves nothing to pay — and PayPal
 * cannot take a $0 payment, so its buttons are no way to book. Such a booking
 * is confirmed straight away by create-class-booking, which checks the coupon
 * again on the server. Several spots always go through payment.
 */
export function isFreeWithCoupon(opts: {
  payMethod: string;
  multi: boolean;
  hasCoupon: boolean;
  total: number;
}): boolean {
  return opts.payMethod === "card" && !opts.multi && opts.hasCoupon && opts.total <= 0;
}

/** The studio's pass and membership codes look like "RD4424". */
export function looksLikePassCode(code: string): boolean {
  return /^[A-Z]{2}\d{4}$/i.test(code.trim());
}
