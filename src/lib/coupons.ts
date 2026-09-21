import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";

export interface CouponRecord {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  restricted_service_ids: string[] | null;
  restricted_class_ids: string[] | null;
  restricted_product_ids: string[] | null;
  restricted_package_ids: string[] | null;
}

export interface ValidateOpts {
  serviceId?: string | null;
  classId?: string | null;
  productId?: string | null;
  packageId?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  coupon?: CouponRecord;
  discountAmount?: number;
}

export async function validateCoupon(
  rawCode: string,
  basePrice: number,
  opts: ValidateOpts,
): Promise<ValidationResult> {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) return { valid: false, reason: "No code" };

  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return { valid: false, reason: "Coupon not found" };

  const c = data as CouponRecord;
  if (!c.is_active) return { valid: false, reason: "Coupon inactive" };
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return { valid: false, reason: "Coupon expired" };
  if (c.max_uses != null && c.current_uses >= c.max_uses)
    return { valid: false, reason: "Coupon usage limit reached" };

  // If a Spa Package is selected, ensure it exists and is active.
  if (opts.packageId) {
    const { data: pkg, error: pkgErr } = await supabase
      .from("spa_packages")
      .select("id, is_active")
      .eq("id", opts.packageId)
      .maybeSingle();
    if (pkgErr || !pkg) {
      return { valid: false, reason: "Selected spa package not found" };
    }
    if (!pkg.is_active) {
      return {
        valid: false,
        reason: "Selected spa package is currently inactive",
      };
    }
  }

  // Some classes are always paid in full: no coupon touches them. The server
  // checks this too — this is so the person is told before they press Book.
  if (opts.classId) {
    const { data: klass } = await supabase
      .from("classes")
      .select("title, full_price_only")
      .eq("id", opts.classId)
      .maybeSingle();
    if ((klass as any)?.full_price_only) {
      return { valid: false, reason: `${(klass as any).title} is always paid in full — coupons do not apply to it` };
    }
  }

  // Restriction check: if any restriction list is set, the matching id must be in it.
  const checkList = (
    list: string[] | null | undefined,
    id: string | null | undefined,
    label: string,
  ): { ok: boolean; label: string } | null => {
    if (!list || list.length === 0) return null; // not restricted on this dimension
    return { ok: !!id && list.includes(id), label };
  };

  const checks = [
    checkList(c.restricted_service_ids, opts.serviceId, "services"),
    checkList(c.restricted_class_ids, opts.classId, "classes"),
    checkList(c.restricted_product_ids, opts.productId, "products"),
    checkList(c.restricted_package_ids, opts.packageId, "spa packages"),
  ].filter((v): v is { ok: boolean; label: string } => v !== null);

  if (checks.length > 0 && !checks.some((v) => v.ok)) {
    // If the coupon is package-restricted but no package was selected,
    // surface a clear message instead of a generic "does not apply".
    if (
      c.restricted_package_ids &&
      c.restricted_package_ids.length > 0 &&
      !opts.packageId
    ) {
      return {
        valid: false,
        reason: "This coupon is only valid for specific spa packages",
      };
    }
    const allowed = checks.map((c) => c.label).join(", ");
    return {
      valid: false,
      reason: `Coupon only applies to: ${allowed}`,
    };
  }

  const discountAmount =
    c.discount_type === "percentage"
      ? Math.round(basePrice * (c.discount_value / 100) * 100) / 100
      : Math.min(basePrice, c.discount_value);

  return { valid: true, coupon: c, discountAmount };
}

/**
 * What a coupon takes off, in the terms it was set up with.
 *
 * A percentage coupon reads as its percentage, with the exact amount beside it
 * ("15% off (−$19.65)"); a fixed one reads as its dollar value. The amount is
 * never rounded: MAXWELLNESS used to show as "$20 off", which guests read as a
 * 20% coupon when it is 15%.
 */
export function describeCouponDiscount(
  coupon: Pick<CouponRecord, "discount_type" | "discount_value">,
  amount: number,
): string {
  const value = Number(coupon.discount_value);
  if (coupon.discount_type === "percentage") {
    return `${value}% off (−${formatPrice(amount)})`;
  }
  // A fixed coupon larger than the price is capped at the price.
  return amount < value
    ? `${formatPrice(value)} off (−${formatPrice(amount)} on this booking)`
    : `${formatPrice(value)} off`;
}
