// Helpers for the admin Retreats editor. They tidy what the admin typed
// (blank rows, day numbers) while keeping every other field of the stored
// objects exactly as it was, so saving never drops information the website
// uses.

import type { ItineraryDay, PricingTier } from "@/hooks/useRetreats";

export interface RetreatDraft {
  id?: string;
  title: string;
  title_es: string | null;
  slug: string;
  short_description: string | null;
  short_description_es: string | null;
  description: string | null;
  description_es: string | null;
  type: string;
  duration_days: number;
  image_url: string | null;
  gallery_images: string[];
  pricing_tiers: PricingTier[];
  itinerary: ItineraryDay[];
  itinerary_es: ItineraryDay[];
  inclusions: string[];
  inclusions_es: string[];
  deposit_percentage: number;
  booking_policies: string | null;
  booking_policies_es: string | null;
  is_active: boolean;
  sort_order: number;
}

export const INQUIRY_STATUSES = ["new", "contacted", "confirmed", "completed", "cancelled"] as const;

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** A stored row, with every list guaranteed to be an array. */
export function toRetreatDraft(row: any): RetreatDraft {
  return {
    ...row,
    gallery_images: arr<string>(row.gallery_images),
    pricing_tiers: arr<PricingTier>(row.pricing_tiers),
    itinerary: arr<ItineraryDay>(row.itinerary),
    itinerary_es: arr<ItineraryDay>(row.itinerary_es),
    inclusions: arr<string>(row.inclusions),
    inclusions_es: arr<string>(row.inclusions_es),
  };
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const isValidSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export const cleanList = (items: string[]) => items.map((s) => (s ?? "").trim()).filter(Boolean);

export const renumberItinerary = (days: ItineraryDay[]) => days.map((d, i) => ({ ...d, day: i + 1 }));

export function cleanItinerary(days: ItineraryDay[]): ItineraryDay[] {
  return renumberItinerary(
    days
      .map((d) => ({ ...d, title: (d.title ?? "").trim(), activities: cleanList(arr<string>(d.activities)) }))
      .filter((d) => d.title || d.activities.length),
  );
}

type PriceRow = { occupancy: string; price: number };
const cleanRows = (rows: PriceRow[]) =>
  arr<PriceRow>(rows)
    .map((r) => ({ ...r, occupancy: (r.occupancy ?? "").trim(), price: Math.max(0, Number(r.price) || 0) }))
    .filter((r) => r.occupancy);

export function cleanPricing(tiers: PricingTier[]): PricingTier[] {
  return tiers.map((t) => ({
    ...t,
    label: (t.label ?? "").trim(),
    with_accommodation: cleanRows(t.with_accommodation),
    without_accommodation: cleanRows(t.without_accommodation),
  }));
}

/** The lowest price over every season and option — the website's "From $X". */
export function startingPrice(tiers: PricingTier[]): number | null {
  const prices = arr<PricingTier>(tiers)
    .flatMap((t) => [...arr<PriceRow>(t.with_accommodation), ...arr<PriceRow>(t.without_accommodation)])
    .map((r) => Number(r.price))
    .filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export const newSeason = (): PricingTier => ({
  season: `season-${Date.now()}`,
  label: "New season",
  with_accommodation: [
    { occupancy: "single", price: 0 },
    { occupancy: "double", price: 0 },
    { occupancy: "triple", price: 0 },
  ],
  without_accommodation: [
    { occupancy: "1 person", price: 0 },
    { occupancy: "2 people", price: 0 },
    { occupancy: "3 people", price: 0 },
  ],
});

/** A new retreat starts hidden, so nothing half-finished reaches the website. */
export const newRetreatDraft = (sortOrder: number): RetreatDraft => ({
  title: "",
  title_es: "",
  slug: "",
  short_description: "",
  short_description_es: "",
  description: "",
  description_es: "",
  type: "retreat",
  duration_days: 4,
  image_url: null,
  gallery_images: [],
  pricing_tiers: [newSeason()],
  itinerary: [],
  itinerary_es: [],
  inclusions: [],
  inclusions_es: [],
  deposit_percentage: 40,
  booking_policies: "",
  booking_policies_es: "",
  is_active: false,
  sort_order: sortOrder,
});

/** What gets written to the database — only the retreat's own columns. */
export function retreatPayload(d: RetreatDraft) {
  const text = (v: string | null) => (v ?? "").trim();
  return {
    title: d.title.trim(),
    title_es: text(d.title_es),
    slug: d.slug.trim(),
    short_description: text(d.short_description),
    short_description_es: text(d.short_description_es),
    description: text(d.description),
    description_es: text(d.description_es),
    type: d.type || "retreat",
    duration_days: Math.max(1, Math.round(Number(d.duration_days) || 1)),
    image_url: d.image_url,
    gallery_images: d.gallery_images,
    pricing_tiers: cleanPricing(d.pricing_tiers),
    itinerary: cleanItinerary(d.itinerary),
    itinerary_es: cleanItinerary(d.itinerary_es),
    inclusions: cleanList(d.inclusions),
    inclusions_es: cleanList(d.inclusions_es),
    deposit_percentage: Math.min(100, Math.max(0, Math.round(Number(d.deposit_percentage) || 0))),
    booking_policies: text(d.booking_policies),
    booking_policies_es: text(d.booking_policies_es),
    is_active: d.is_active,
    sort_order: Number(d.sort_order) || 0,
  };
}
