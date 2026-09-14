import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryFromSlug, treatmentCategoryPath, TREATMENT_CATEGORY_SLUGS } from "@/lib/treatmentCategories";
import { seo } from "@/data/content";

// Each Treatments category is its own shareable page (for Linktree, the menu
// and links sent to clients).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("treatment category URLs", () => {
  it("gives every category a readable path", () => {
    expect(treatmentCategoryPath("Massage Therapy")).toBe("/treatments-therapies/massage-therapy");
    expect(treatmentCategoryPath("Organic Facials")).toBe("/treatments-therapies/organic-facials");
    expect(treatmentCategoryPath("Spa Packages")).toBe("/treatments-therapies/spa-packages");
  });

  it("round-trips every slug, and accepts common variants", () => {
    for (const [cat, slug] of Object.entries(TREATMENT_CATEGORY_SLUGS)) {
      expect(categoryFromSlug(slug)).toBe(cat);
    }
    expect(categoryFromSlug("organic-facial")).toBe("Organic Facials");
    expect(categoryFromSlug("MASSAGE-THERAPY")).toBe("Massage Therapy");
    expect(categoryFromSlug("nope")).toBeNull();
  });

  it("has its own SEO entry per category, so the build prerenders each page", () => {
    const canonicals = Object.values(seo).map((s) => s.canonical);
    for (const cat of Object.keys(TREATMENT_CATEGORY_SLUGS)) {
      expect(canonicals).toContain(treatmentCategoryPath(cat));
    }
  });

  it("routes the category pages and the menu uses them", () => {
    expect(read("src/App.tsx")).toContain('path: "/treatments-therapies/:category"');
    expect(read("src/components/Navbar.tsx")).not.toContain("?category=");
  });

  it("forwards old ?category= links to the new pages", () => {
    expect(read("src/pages/Services.tsx")).toContain("treatmentCategoryPath(legacyCategory)");
  });
});
