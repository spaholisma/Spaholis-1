import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { describeCouponDiscount } from "@/lib/coupons";
import { formatPrice } from "@/lib/currency";

// A coupon has to read exactly as it was set up. MAXWELLNESS (15%) used to show
// as "$20 off" because the $19.65 it takes off a $131 treatment was rounded to
// the dollar — which reads as a 20% coupon. The maths was right; the words
// were not.
const pct = (v: string) => ({ discount_type: "percentage", discount_value: v as unknown as number });
const fixed = (v: string) => ({ discount_type: "fixed", discount_value: v as unknown as number });

describe("coupon wording", () => {
  it("shows MAXWELLNESS as 15%, with the exact amount", () => {
    expect(describeCouponDiscount(pct("15.00"), 19.65)).toBe("15% off (−$19.65)");
  });

  // Every percentage in use today, as stored ("10.00", "25.00"...).
  it.each([
    ["10.00", 13.1, "10% off (−$13.10)"],
    ["20.00", 26.2, "20% off (−$26.20)"],
    ["25.00", 32.75, "25% off (−$32.75)"],
    ["100.00", 131, "100% off (−$131)"],
    ["12.50", 16.38, "12.5% off (−$16.38)"],
  ])("shows %s%% as its own percentage", (value, amount, text) => {
    expect(describeCouponDiscount(pct(value), amount)).toBe(text);
  });

  it("shows a fixed coupon as its dollar value", () => {
    expect(describeCouponDiscount(fixed("5.00"), 5)).toBe("$5 off");
  });

  // TICOTICOYOGA and TULEYOGA take one cent off; rounded, they read "$0 off".
  it("shows a one-cent coupon as one cent", () => {
    expect(describeCouponDiscount(fixed("0.01"), 0.01)).toBe("$0.01 off");
  });

  it("says when a fixed coupon is capped at the price", () => {
    expect(describeCouponDiscount(fixed("50.00"), 23)).toBe("$50 off (−$23 on this booking)");
  });
});

describe("prices after a coupon", () => {
  it("keeps whole prices whole", () => {
    expect(formatPrice(131)).toBe("$131");
    expect(formatPrice("101.00")).toBe("$101");
  });

  it("shows the cents a coupon leaves", () => {
    expect(formatPrice(111.35)).toBe("$111.35");
    expect(formatPrice(117.9)).toBe("$117.90");
  });

  it("never shows a negative or empty total", () => {
    expect(formatPrice(0)).toBe("$0");
    expect(formatPrice(null)).toBe("$0");
  });
});
