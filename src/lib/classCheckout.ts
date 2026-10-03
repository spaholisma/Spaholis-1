// The class checkout's arithmetic and decisions, without the screen, so they
// can be tested.

/** What a card payment would come to: every spot, less any coupon. */
export function cardTotal(price: number, quantity: number, discount: number): number {
  return Math.max(0, Math.round((quantity * price - discount) * 100) / 100);
}

/**
 * What the guest brings to the class when paying in cash: every spot at the
 * class price. Coupons are for online payment, so they do not apply.
 */
export function cashTotal(price: number, quantity: number): number {
  return Math.max(0, Math.round(quantity * price * 100) / 100);
}

/** Who is paid in cash at the class: the teacher of that session, else the class's. */
export function cashPayee(sessionInstructor?: string | null, classInstructor?: string | null): string | null {
  return (sessionInstructor ?? "").trim() || (classInstructor ?? "").trim() || null;
}

/**
 * Where an online payment for a class goes (studio-rental model — Holis takes
 * no student money):
 *  - "teacher":   the session's teacher takes PayPal → paid straight to her
 *  - "cash_only": she doesn't take PayPal yet → her students pay her in cash
 *  - "holis":     nobody on the session is a teacher (e.g. a Holis event) → as before
 *  - "loading":   the teachers are still being looked up — offer nothing yet
 */
export type OnlinePayRoute = "teacher" | "cash_only" | "holis" | "loading";
export function onlinePayRoute(
  payee: string | null,
  teachers: { display_name: string; accepts_paypal?: boolean | null }[] | undefined,
): OnlinePayRoute {
  if (!payee) return "holis";
  if (!teachers) return "loading";
  const name = payee.trim().toLowerCase();
  const teacher = teachers.find((t) => (t.display_name ?? "").trim().toLowerCase() === name);
  if (!teacher) return "holis";
  return teacher.accepts_paypal ? "teacher" : "cash_only";
}

/**
 * The session's teacher's CompraClick link, when she has CompraClick switched
 * on (the public list only carries the link while it is on).
 */
export function teacherCompraClick(
  payee: string | null,
  teachers: { display_name: string; compraclick_url?: string | null }[] | undefined,
): string | null {
  if (!payee || !teachers) return null;
  const name = payee.trim().toLowerCase();
  const t = teachers.find((x) => (x.display_name ?? "").trim().toLowerCase() === name);
  const url = (t?.compraclick_url ?? "").trim();
  return url || null;
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

/**
 * The name and email a booking must carry, when we already know them.
 *
 * A member could book a friend into class for free under the friend's name.
 * Signed in, the booking is theirs: name and email come from the account.
 * Arriving through a pass's own link, they come from the pass. Whatever is
 * missing stays open to type (null). The server holds to the same rule.
 */
export function lockedDetails(opts: {
  signedIn: boolean;
  account?: { name?: string | null; email?: string | null } | null;
  authEmail?: string | null;
  pass?: { guest_name?: string | null; guest_email?: string | null } | null;
}): { name: string | null; email: string | null } {
  const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
  if (opts.signedIn) {
    return {
      name: clean(opts.account?.name),
      email: clean(opts.account?.email) ?? clean(opts.authEmail),
    };
  }
  if (opts.pass) {
    return { name: clean(opts.pass.guest_name), email: clean(opts.pass.guest_email) };
  }
  return { name: null, email: null };
}

/** The studio's pass and membership codes look like "RD4424". */
export function looksLikePassCode(code: string): boolean {
  return /^[A-Z]{2}\d{4}$/i.test(code.trim());
}
