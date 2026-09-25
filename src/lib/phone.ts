import { parsePhoneNumber } from "react-phone-number-input";

/**
 * A phone number as the country picker needs it: "+50688881234".
 *
 * Numbers typed at the desk over the years come in every shape — "8888-1234",
 * "+506 8888 1234", "001 305 555 0100". Anything without a country code is read
 * as Costa Rican. Returns "" when it cannot be read as a phone number at all,
 * so the caller can keep what was on file instead of losing it.
 */
export function toE164(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let cleaned = s.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.replace(/\D/g, "").length < 6) return "";
  try {
    const parsed = parsePhoneNumber(cleaned, "CR");
    return parsed?.number ? String(parsed.number) : "";
  } catch {
    return "";
  }
}
