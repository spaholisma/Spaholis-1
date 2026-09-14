import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldShowPromo } from "@/lib/promoPopup";
import { content } from "@/data/content";

// The Wellness Programs promo window.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("promo popup", () => {
  it("shows on browsing pages, in both languages", () => {
    for (const p of ["/", "/about", "/classes", "/treatments-therapies/massage-therapy", "/es", "/es/retreats"]) {
      expect(shouldShowPromo(p)).toBe(true);
    }
  });

  it("never interrupts booking, checkout, sign-in, admin or the page it promotes", () => {
    for (const p of ["/book", "/booking/return", "/class-booking", "/experience-booking", "/auth", "/admin", "/dashboard", "/wellness-programs", "/es/book", "/es/wellness-programs"]) {
      expect(shouldShowPromo(p)).toBe(false);
    }
  });

  it("is mounted once for the whole site and can be switched off", () => {
    expect(read("src/App.tsx")).toContain("<PromoPopup />");
    expect(content.promoPopup.enabled).toBe(true);
    const popup = read("src/components/PromoPopup.tsx");
    expect(popup).toContain("DialogPrimitive.Close");
    expect(popup).toContain("c.dismissText");
  });
});
