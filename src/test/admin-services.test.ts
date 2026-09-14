import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  blankToNull, categoryOptions, filterServices, richOrNull, serviceWebsitePath, sortServices,
} from "@/lib/adminServices";

// Admin > Services: every service in one searchable list, editable in both languages.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const svc = (over: Partial<Parameters<typeof serviceWebsitePath>[0]> = {}) => ({
  title: "Pure Bliss (60min)",
  title_es: null,
  description: "",
  category: "Massage Therapy",
  type: "treatment",
  is_active: true,
  is_addon: false,
  sort_order: 0,
  ...over,
});

describe("admin services list", () => {
  const list = [
    svc({ title: "Resonate", category: "Wellness Programs", type: "program", sort_order: 50 }),
    svc({ title: "Hot Stones (90min)", sort_order: 2, is_active: false }),
    svc({ title: "PURA VIDA", category: "Spa Packages", sort_order: 1 }),
    svc({ title: "Masaje Relajante", title_es: "Masaje Relajante", sort_order: 1 }),
    svc({ title: "Cupping", category: "Add-ons", is_addon: true }),
    svc({ title: "SAS Level 1", category: "course", type: "course" }),
  ];

  it("offers every category in use, including packages, add-ons and courses", () => {
    const opts = categoryOptions(list);
    for (const c of ["Massage Therapy", "Wellness Programs", "Spa Packages", "Add-ons", "course"]) expect(opts).toContain(c);
    expect(categoryOptions(list, "Something New")).toContain("Something New");
  });

  it("searches names in English or Spanish, ignoring accents and case", () => {
    expect(filterServices(list, { query: "resonate" }).map((s) => s.title)).toEqual(["Resonate"]);
    expect(filterServices(list, { query: "MASAJE" })).toHaveLength(1);
    expect(filterServices([svc({ title: "Facial", title_es: "Facial Orgánico" })], { query: "organico" })).toHaveLength(1);
  });

  it("filters by category and by shown/hidden", () => {
    expect(filterServices(list, { category: "Spa Packages" }).map((s) => s.title)).toEqual(["PURA VIDA"]);
    expect(filterServices(list, { status: "inactive" }).map((s) => s.title)).toEqual(["Hot Stones (90min)"]);
    expect(filterServices(list, { status: "active" })).toHaveLength(5);
  });

  it("keeps the website's category order, then each category's order", () => {
    expect(sortServices(list).map((s) => s.title)).toEqual([
      "Masaje Relajante", "Hot Stones (90min)", "Resonate", "PURA VIDA", "Cupping", "SAS Level 1",
    ]);
  });

  it("links each service to the page it appears on", () => {
    expect(serviceWebsitePath(svc())).toBe("/treatments-therapies/massage-therapy");
    expect(serviceWebsitePath(svc({ category: "Wellness Programs", type: "program" }))).toBe("/wellness-programs");
    expect(serviceWebsitePath(svc({ category: "Spa Packages" }))).toBe("/treatments-therapies/spa-packages");
    expect(serviceWebsitePath(svc({ category: "course", type: "course" }))).toBe("/education");
    expect(serviceWebsitePath(svc({ category: "Manuel Antonio Experiences", type: "experience" }))).toBe("/retreats?tab=experiences");
    expect(serviceWebsitePath(svc({ category: "Add-ons", is_addon: true }))).toBeNull();
  });

  it("saves empty Spanish text as empty, so the site falls back to English", () => {
    expect(blankToNull("  ")).toBeNull();
    expect(blankToNull("Masaje")).toBe("Masaje");
    expect(richOrNull({ html: "<p></p>" })).toBeNull();
    expect(richOrNull({ html: "<p>Hola</p>" })).toEqual({ html: "<p>Hola</p>" });
  });
});

describe("admin services editor", () => {
  const src = read("src/components/admin/AdminServicesManager.tsx");

  it("loads every service, not only active ones", () => {
    expect(src).toContain('supabase.from("services").select("*").order("sort_order")');
    expect(src).not.toMatch(/from\("services"\)[^;]*\.eq\("is_active"/);
  });

  it("edits the Spanish name and descriptions", () => {
    for (const f of ["title_es:", "description_es:", "description_rich_es:"]) expect(src).toContain(f);
  });

  it("keeps a Spa Package card's name and price in step with its service", () => {
    expect(src).toContain('.from("spa_packages")');
    expect(src).toContain("name: payload.title, price: payload.price");
  });

  it("explains instead of failing when a booked service is deleted", () => {
    expect(src).toContain('"23503"');
  });
});
