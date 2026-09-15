import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanItinerary, cleanList, cleanPricing, isValidSlug, moveItem, newRetreatDraft, retreatPayload,
  slugify, startingPrice, toRetreatDraft,
} from "@/lib/adminRetreats";

// Admin > Retreats: edit the multi-day retreats without losing anything the
// website shows, and email the team for every inquiry.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const TIERS = [
  {
    label: "Green Season (May 1 – Dec 20)",
    season: "green",
    with_accommodation: [{ price: 1650, occupancy: "single" }, { price: 2433, occupancy: "double" }],
    without_accommodation: [{ price: 834, occupancy: "1 person" }],
  },
  {
    label: "High Season (Dec 21 – Apr 30)",
    season: "high",
    with_accommodation: [{ price: 2541, occupancy: "single" }],
    without_accommodation: [{ price: 834, occupancy: "1 person" }],
  },
];

describe("retreat editor data", () => {
  it("keeps the stored pricing exactly as the website reads it", () => {
    expect(cleanPricing(TIERS as any)).toEqual(TIERS);
  });

  it("drops only blank price rows, and keeps any extra keys", () => {
    const tiers = [{ ...TIERS[0], note: "keep me", with_accommodation: [...TIERS[0].with_accommodation, { occupancy: " ", price: 5 }] }];
    const out = cleanPricing(tiers as any) as any;
    expect(out[0].note).toBe("keep me");
    expect(out[0].with_accommodation).toHaveLength(2);
  });

  it("shows the same 'From' price as the website", () => {
    expect(startingPrice(TIERS as any)).toBe(834);
    expect(startingPrice([])).toBeNull();
  });

  it("renumbers the itinerary and drops empty days and activities", () => {
    const days = [
      { day: 1, title: "Arrival", activities: ["Welcome", " "] },
      { day: 2, title: "", activities: [] },
      { day: 3, title: "Surf", activities: ["Lesson"] },
    ];
    expect(cleanItinerary(days)).toEqual([
      { day: 1, title: "Arrival", activities: ["Welcome"] },
      { day: 2, title: "Surf", activities: ["Lesson"] },
    ]);
  });

  it("tidies lists and moves items", () => {
    expect(cleanList(["a", "  ", " b "])).toEqual(["a", "b"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("makes safe web addresses", () => {
    expect(slugify("6-Day 'Love Your Life' Retreat")).toBe("6-day-love-your-life-retreat");
    expect(slugify("Retiro de Relajación")).toBe("retiro-de-relajacion");
    expect(isValidSlug("beach-yoga-retreat")).toBe(true);
    expect(isValidSlug("Beach Yoga")).toBe(false);
  });

  it("writes back every field of an untouched retreat unchanged", () => {
    const stored = {
      id: "96da9bdf-31b3-4d91-8991-22e599e6168e", slug: "beach-yoga-retreat", type: "retreat",
      title: "4-Day Beach & Yoga Retreat", title_es: "4-Day Beach & Yoga Retreat", image_url: "https://x/y.jpg",
      is_active: true, inclusions: ["3-night stay"], sort_order: 1, itinerary_es: [], duration_days: 4, inclusions_es: [],
      pricing_tiers: TIERS, booking_policies: "A 40% deposit…", short_description: "The ultimate…", deposit_percentage: 40,
      booking_policies_es: "A 40% deposit…", short_description_es: "The ultimate…", description: "Long text", description_es: "Long text",
      gallery_images: ["a.jpg", "b.jpg"], itinerary: [{ day: 1, title: "Arrival", activities: ["Welcome"] }],
    };
    const payload = retreatPayload(toRetreatDraft(stored));
    for (const [k, v] of Object.entries(payload)) expect([k, v]).toEqual([k, (stored as any)[k]]);
  });

  it("starts a new retreat hidden", () => {
    expect(newRetreatDraft(5).is_active).toBe(false);
  });
});

describe("retreats admin wiring", () => {
  it("adds a Retreats section to the admin, loading hidden retreats too", () => {
    const dash = read("src/pages/AdminDashboard.tsx");
    expect(dash).toContain('id: "retreats"');
    expect(dash).toContain("<AdminRetreatsManager />");
    const mgr = read("src/components/admin/AdminRetreatsManager.tsx");
    expect(mgr).toContain('supabase.from("retreats").select("*").order("sort_order")');
    expect(mgr).toContain('"retreat_inquiries"');
  });

  it("never deletes a retreat from the admin", () => {
    expect(read("src/components/admin/AdminRetreatsManager.tsx")).not.toMatch(/from\("retreats"\)[^;]*\.delete\(/);
  });

  const sql = read("supabase/migrations/20260914150000_retreat_editor_and_inquiry_emails.sql").replace(/--.*$/gm, "");

  it("lets guests send the inquiry forms", () => {
    expect(sql).toContain("grant insert on public.retreat_inquiries to anon, authenticated");
    expect(sql).toContain("grant insert on public.custom_retreat_inquiries to anon, authenticated");
  });

  it("keeps a backup copy and emails both kinds of inquiry without blocking them", () => {
    expect(sql).toContain("create table if not exists public.retreats_backup_20260914 as table public.retreats");
    expect(sql).toMatch(/after insert on public\.retreat_inquiries/);
    expect(sql).toMatch(/after insert on public\.custom_retreat_inquiries/);
    expect(sql).toContain("exception when others then");
    expect(sql).not.toMatch(/\bdelete\b|\bdrop table\b|\btruncate\b/i);
  });

  it("only the signed database trigger can send the email", () => {
    const fn = read("supabase/functions/send-inquiry-notification/index.ts");
    expect(fn).toContain('req.headers.get("x-notify-secret") !== secret.value');
    expect(fn).toContain("reply_to");
  });
});
