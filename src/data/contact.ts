/**
 * ═══════════════════════════════════════════════════════════════
 *  CONTACT — SINGLE SOURCE OF TRUTH
 *  Canonical business contact details for Holis Wellness Center.
 *  Every phone/WhatsApp/email reference in the app MUST derive
 *  from this file. Do not hardcode contact numbers elsewhere.
 *  Runtime validators in src/lib/whatsapp.ts enforce this.
 * ═══════════════════════════════════════════════════════════════
 */

/** Digits-only E.164 number without the leading "+". */
export const HOLIS_PHONE_E164_DIGITS = "50688146760";

/** Human-friendly display: "+506 8814 6760". */
export const HOLIS_PHONE_DISPLAY = "+506 8814 6760";

/** tel: link for click-to-call. */
export const HOLIS_PHONE_TEL_URL = `tel:+${HOLIS_PHONE_E164_DIGITS}`;

/** Canonical wa.me link (no query string). */
export const HOLIS_WHATSAPP_URL = `https://wa.me/${HOLIS_PHONE_E164_DIGITS}`;

/** Alias — the WhatsApp number is the same as the business phone. */
export const HOLIS_WHATSAPP_NUMBER = HOLIS_PHONE_E164_DIGITS;

/** The inbox guests write to — cancellations included. The edge function
 *  send-booking-notification keeps a copy (Deno cannot import from src/), and
 *  src/test/email-contact-details.test.ts checks the two agree. */
export const HOLIS_EMAIL = "spaholisma@gmail.com";

export const contact = {
  phoneDigits: HOLIS_PHONE_E164_DIGITS,
  phoneDisplay: HOLIS_PHONE_DISPLAY,
  phoneTelUrl: HOLIS_PHONE_TEL_URL,
  whatsappNumber: HOLIS_WHATSAPP_NUMBER,
  whatsappUrl: HOLIS_WHATSAPP_URL,
} as const;
