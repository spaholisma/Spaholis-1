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

export function shouldShowPromo(pathname: string): boolean {
  const base = stripLangPrefix(pathname);
  return !NO_PROMO.some((re) => re.test(base));
}
