import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildExtraRows, completeEsList, DEFAULT_PRIVATE_PRICING, filterExtraRows, parseRatePrice,
  privatePriceUsd, privatePricing, setIn,
} from "@/lib/otherOfferings";

// Admin > Services lists everything the site sells: services plus private
// classes, studio rates, signature cards, memberships and retreats.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("private class prices", () => {
  it("keep today's prices when nothing has been edited", () => {
    expect(privatePricing(undefined)).toEqual({ onePerson: 85, twoPeople: 113, upToFour: 170, extraPerson: 28 });
    expect(privatePricing({ pricing: { onePerson: 0, twoPeople: "abc" } })).toEqual(DEFAULT_PRIVATE_PRICING);
  });

  it("charge the same as the page did before", () => {
    const p = DEFAULT_PRIVATE_PRICING;
    expect([1, 2, 3, 4, 5, 6].map((n) => privatePriceUsd(n, p))).toEqual([85, 113, 170, 170, 198, 226]);
  });

  it("use edited prices", () => {
    expect(privatePriceUsd(6, privatePricing({ pricing: { onePerson: 90, twoPeople: 120, upToFour: 180, extraPerson: 30 } }))).toBe(240);
  });

  it("are no longer written in the page code", () => {
    const page = read("src/pages/PrivateClasses.tsx");
    expect(page).not.toMatch(/\b85 \* USD_RATE|usd = 85|return 85/);
    expect(page).toContain("privatePriceUsd(participants, pricing)");
  });
});

describe("saving website texts", () => {
  it("changes only the edited field", () => {
    const content = { privateSessions: { title: "Private Classes", classes: { oneOnOne: { title: "A", description: "D" } } }, hero: { title: "H" } };
    const next = setIn(content, ["privateSessions", "classes", "oneOnOne", "title"], "B");
    expect(next.privateSessions.classes.oneOnOne).toEqual({ title: "B", description: "D" });
    expect(next.hero).toBe(content.hero);
    expect(content.privateSessions.classes.oneOnOne.title).toBe("A");
  });

  it("keeps Spanish lists complete, falling back to English", () => {
    const en = [{ title: "Somato", benefit: "Reset", serviceId: "x" }, { title: "Facial", benefit: "Glow", serviceId: "y" }];
    const es = [{ title: "Somato ES", benefit: "" }, {}];
    expect(completeEsList(en, es, ["title", "benefit"])).toEqual([
      { title: "Somato ES", benefit: "Reset", serviceId: "x" },
      { title: "Facial", benefit: "Glow", serviceId: "y" },
    ]);
  });

  it("reads studio rates", () => {
    expect(parseRatePrice("$45")).toBe(45);
    expect(parseRatePrice("$1,250")).toBe(1250);
  });

  it("re-reads the texts before saving and refuses to overwrite them if they can't be read", () => {
    const src = read("src/components/admin/OtherOfferings.tsx");
    expect(src).toContain("Could not read the current website texts, so nothing was saved");
    expect(src).not.toContain(".upsert(");
  });

  it("keeps a backup of the website texts", () => {
    const sql = read("supabase/migrations/20260914160000_site_content_backup.sql").replace(/--.*$/gm, "");
    expect(sql).toContain("create table if not exists public.site_content_backup_20260914 as table public.site_content");
    expect(sql).not.toMatch(/\bdelete\b|\bdrop\b|\btruncate\b|\bupdate\b/i);
  });
});

describe("one list for everything we offer", () => {
  const rows = buildExtraRows(
    { en: {}, es: {} },
    [{ id: "o1", name: "10-Class Pass", type: "class_pass", price: 168, status: "active" }],
    [{ id: "r1", title: "4-Day Beach & Yoga Retreat", slug: "beach-yoga-retreat", duration_days: 4, image_url: null, is_active: true, pricing_tiers: [{ season: "g", label: "G", with_accommodation: [{ occupancy: "single", price: 1650 }], without_accommodation: [{ occupancy: "1 person", price: 834 }] }] }],
  );
  const count = (c: string) => rows.filter((r) => r.category === c).length;

  it("includes private classes, studio rates, signature cards, memberships and retreats", () => {
    expect(count("Private Classes")).toBe(4);
    expect(count("Studio Rental")).toBe(1);
    expect(count("Signature Experiences")).toBe(9); // 4 homepage + 5 Signature page
    expect(count("Memberships & Passes")).toBe(1);
    expect(count("Retreats")).toBe(1);
    expect(rows.find((r) => r.kind === "retreat")?.subtitle).toBe("4 days · from $834");
    expect(rows.find((r) => r.kind === "studio")?.subtitle).toBe("5 rates · $45–$226");
  });

  it("can be searched and filtered like services", () => {
    expect(filterExtraRows(rows, { query: "couple" }).map((r) => r.kind)).toEqual(["private"]);
    expect(filterExtraRows(rows, { category: "Retreats" })).toHaveLength(1);
  });

  it("shows them in Admin > Services, except the weekly classes", () => {
    const mgr = read("src/components/admin/AdminServicesManager.tsx");
    expect(mgr).toContain("<ExtraRowItem");
    expect(mgr).toContain("EXTRA_CATEGORIES.map");
    expect(read("src/lib/otherOfferings.ts")).not.toMatch(/from\("classes"\)|"class_schedule"/);
  });
});
