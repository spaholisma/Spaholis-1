import { stripLangPrefix } from "@/i18n/LanguageProvider";

// Pages where the promo popup must never interrupt: checkout and booking
// flows, sign-in, the admin and client areas, and the page it promotes.
const NO_PROMO = [
  /^\/admin/,
  /^\/book/,
  /^\/booking/,
  /^\/class-booking/,
  /^\/experience-booking/,
  /^\/auth/,
  /^\/reset-password/,
  /^\/dashboard/,
  /^\/teacher/,
  /^\/test-payment/,
  /^\/wellness-programs/,
];

// Once per visit: remembered for the browser tab's session, so a refresh or
// another page doesn't show it again; a new visit (new tab, browser reopened)
// does. If storage is blocked it simply shows once per page load.
const SEEN_KEY = "holis-promo-wellness-programs-seen";

export function promoSeenThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPromoSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage blocked — nothing to remember */
  }
}

export function shouldShowPromo(pathname: string): boolean {
  const base = stripLangPrefix(pathname);
  return !NO_PROMO.some((re) => re.test(base));
}
