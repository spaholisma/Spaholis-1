import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/**
 * Local discount with a Costa Rican cédula.
 *
 * Each teacher has her own local discount (set by the team in Admin). A
 * student who says they have a Costa Rican cédula de identidad, and types one
 * that looks right, pays that much less with her — her passes, her classes
 * and events paid online, and her private classes. The teacher may ask to see
 * the cédula in class.
 *
 * Everything here only SHOWS the price. The server works it out again
 * (teacher_price in the database) and charges that.
 */

export type IdDocumentType = "cr_cedula" | "other";

export interface IdDocument {
  type: IdDocumentType | null;
  number: string;
}

export const EMPTY_ID_DOCUMENT: IdDocument = { type: null, number: "" };

/**
 * A Costa Rican cédula de identidad as 9 digits, or null when it is not one.
 * The same rule as normalize_cr_cedula() in the database: 1-0234-0567,
 * 1 0234 0567, 102340567, the short 1-234-567 and a leading 0 all read as
 * 102340567.
 */
export function normalizeCrCedula(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const parts = s.match(/^0?([1-9])[\s.-]+([0-9]{1,4})[\s.-]+([0-9]{1,4})$/);
  if (parts) return parts[1] + parts[2].padStart(4, "0") + parts[3].padStart(4, "0");
  if (!/^[0-9\s.-]+$/.test(s)) return null;
  let d = s.replace(/[^0-9]/g, "");
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return /^[1-9][0-9]{8}$/.test(d) ? d : null;
}

/** A passport, DIMEX or any other ID: letters and digits, 4 to 30 long. */
const OTHER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9 .-]{3,29}$/;

/** Is the document complete enough to send? (The field is required.) */
export function isIdDocumentValid(doc: IdDocument): boolean {
  if (doc.type === "cr_cedula") return normalizeCrCedula(doc.number) != null;
  if (doc.type === "other") return OTHER_ID_RE.test(doc.number.trim());
  return false;
}

/**
 * Is the ID good enough to continue? It is required — except once a coupon is
 * applied: then it is optional (left empty is fine; typed, it must be right).
 */
export function idDocumentOk(doc: IdDocument, couponApplied = false): boolean {
  if (couponApplied && !doc.number.trim()) return true;
  return isIdDocumentValid(doc);
}

/** What is missing from the ID, in plain words ([] = it is fine). */
export function missingId(doc: IdDocument, couponApplied = false): string[] {
  if (couponApplied && !doc.number.trim()) return [];
  if (!doc.type) return ["your ID (Costa Rican cédula, or passport / other ID)"];
  if (!doc.number.trim()) return [doc.type === "cr_cedula" ? "your cédula number" : "your passport or ID number"];
  if (!isIdDocumentValid(doc)) return [doc.type === "cr_cedula" ? "a valid cédula number (9 digits)" : "a valid passport or ID number"];
  return [];
}

/** Which problem to show under the field ("" when fine, or nothing typed yet). */
export function idDocumentProblem(doc: IdDocument): "" | "cedula" | "other" {
  if (!doc.type) return "";
  const n = doc.number.trim();
  if (!n) return "";
  if (doc.type === "cr_cedula" && !normalizeCrCedula(n)) return "cedula";
  if (doc.type === "other" && !OTHER_ID_RE.test(n)) return "other";
  return "";
}

/** The cédula the server should price with — null for a passport or other ID. */
export function cedulaForPricing(doc: IdDocument): string | null {
  return doc.type === "cr_cedula" ? normalizeCrCedula(doc.number) : null;
}

/** The fields every checkout sends with the payment. */
export function idDocumentBody(doc: IdDocument) {
  return {
    id_document: doc.number.trim() || null,
    id_document_type: doc.type,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A local-discount percentage typed in Admin, kept between 0 and 100. */
export function clampPct(raw: string | number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, round2(n)));
}

/** Her local discount, in money, on one price — the database rounds the same way. */
export function localDiscountAmount(base: number, pct: number): number {
  if (!(base > 0) || !(pct > 0)) return 0;
  return round2((base * Math.min(pct, 100)) / 100);
}

/** Does the local discount apply to this student with this teacher? */
export function localApplies(doc: IdDocument, pct: number): boolean {
  return pct > 0 && cedulaForPricing(doc) != null;
}

export interface LocalDiscountRow { display_name: string; local_discount_pct: number }

/** The teachers who have a local discount, and how much. */
export function useLocalDiscounts() {
  return useQuery({
    queryKey: ["public-local-discounts"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("public_local_discounts");
      if (error) throw error;
      return ((data ?? []) as LocalDiscountRow[]).map((r) => ({
        display_name: r.display_name, local_discount_pct: Number(r.local_discount_pct) || 0,
      }));
    },
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** The local discount (percent) of the teacher by that name — 0 when she has none. */
export function localPctFor(rows: LocalDiscountRow[] | undefined, teacherName: string | null | undefined): number {
  const who = norm(teacherName);
  if (!who) return 0;
  return Number((rows ?? []).find((r) => norm(r.display_name) === who)?.local_discount_pct) || 0;
}

export interface TeacherQuote {
  price: number;
  base: number;
  discount: number;
  local: boolean;
  local_pct: number;
  coupon: string | null;
  coupon_status: "applied" | "not_found" | "ignored_local" | null;
  coupon_type?: string;
  coupon_value?: number;
}

/** Her coupon (or her local discount) on a price, as the server will charge it. */
export async function quoteTeacherPrice(
  teacherName: string, base: number, doc: IdDocument, coupon: string | null,
): Promise<TeacherQuote | null> {
  const { data, error } = await sb.rpc("quote_teacher_price", {
    _teacher_name: teacherName, _base: base, _id_document: cedulaForPricing(doc), _coupon: coupon,
  });
  if (error || !data) return null;
  const q = data as any;
  return {
    price: Number(q.price) || 0, base: Number(q.base) || 0, discount: Number(q.discount) || 0,
    local: !!q.local, local_pct: Number(q.local_pct) || 0,
    coupon: q.coupon ?? null, coupon_status: q.coupon_status ?? null,
    coupon_type: q.coupon_type, coupon_value: q.coupon_value == null ? undefined : Number(q.coupon_value),
  };
}

/** "10% off" / "$5 off" for a coupon the quote applied. */
export function couponLabel(q: Pick<TeacherQuote, "coupon_type" | "coupon_value" | "discount">): string {
  if (q.coupon_type === "percentage" && q.coupon_value != null) return `${q.coupon_value}% off`;
  return `$${Number(q.discount).toFixed(2).replace(/\.00$/, "")} off`;
}

/**
 * Signed in: keep the document on the profile so it is filled in next time.
 * Best effort — a payment never fails because of this.
 */
export async function rememberIdDocument(userId: string | null | undefined, doc: IdDocument) {
  if (!userId || !doc.type || !isIdDocumentValid(doc)) return;
  try {
    await sb.from("profiles")
      .update({ id_document: doc.number.trim(), id_document_type: doc.type })
      .eq("user_id", userId);
  } catch { /* not important enough to bother the student */ }
}

// ── Holis Wellness Center runs the prices (2026-10) ─────────────────────────
// The teachers chose not to use their panel: the local discount and the
// coupons are the studio's now (studio_pricing + the Holis coupons). The
// teacher helpers above stay for when the panel is switched back on.

/** Holis' local discount (percent) for a Costa Rican cédula — 0 when it is off. */
export function useStudioLocalPct() {
  return useQuery({
    queryKey: ["studio-local-pct"],
    queryFn: async () => {
      const { data, error } = await sb.from("studio_pricing").select("local_discount_pct").eq("id", 1).maybeSingle();
      if (error) throw error;
      return Number(data?.local_discount_pct) || 0;
    },
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
}

export type HolisCouponStatus =
  | "applied" | "not_found" | "not_valid" | "not_for_this" | "full_price_only" | "ignored_local";

export interface HolisQuote extends Omit<TeacherQuote, "coupon_status"> {
  coupon_status: HolisCouponStatus | null;
  coupon_id?: string;
}

/**
 * Holis' price for this guest, as the server will charge it: the local
 * discount for a Costa Rican cédula, else a Holis coupon — never both.
 * `classId` for a class, `offeringId` for a pass (a coupon works on a pass
 * only when the team ticked it in Admin → Coupons).
 */
export async function quoteHolisPrice(
  base: number, doc: IdDocument, coupon: string | null,
  opts: { classId?: string | null; offeringId?: string | null } = {},
): Promise<HolisQuote | null> {
  const { data, error } = await sb.rpc("holis_price", {
    _base: base, _id_document: cedulaForPricing(doc), _coupon: coupon,
    _class_id: opts.classId ?? null, _offering_id: opts.offeringId ?? null,
  });
  if (error || !data) return null;
  const q = data as any;
  return {
    price: Number(q.price) || 0, base: Number(q.base) || 0, discount: Number(q.discount) || 0,
    local: !!q.local, local_pct: Number(q.local_pct) || 0,
    coupon: q.coupon ?? null, coupon_status: q.coupon_status ?? null, coupon_id: q.coupon_id,
    coupon_type: q.coupon_type, coupon_value: q.coupon_value == null ? undefined : Number(q.coupon_value),
  };
}

/** Why a coupon did not apply, in plain words (null when it did, or none was typed). */
export function holisCouponProblem(status: HolisCouponStatus | null, what: "class" | "pass" = "class"): string | null {
  switch (status) {
    case "not_found": return "That coupon code doesn't exist.";
    case "not_valid": return "That coupon is no longer valid (expired, used up or switched off).";
    case "not_for_this": return what === "pass" ? "That coupon doesn't work on this pass." : "That coupon doesn't work on this class.";
    case "full_price_only": return "This class is always paid in full — coupons don't apply to it.";
    case "ignored_local": return "Your local discount already applies — coupons don't add to it.";
    default: return null;
  }
}
