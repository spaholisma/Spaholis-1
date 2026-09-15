// What the website sells that does not live in the `services` table, shown
// in Admin > Services next to the services so everything is in one list:
// private classes, studio rental rates, Signature Experiences cards (edited
// right there, stored in site_content), plus memberships/passes and retreats
// (listed, and opened in their own editors).

import { content as defaults } from "@/data/content";
import { startingPrice } from "@/lib/adminRetreats";

export interface ContentPair {
  en: Record<string, any>;
  es: Record<string, any>;
}

export type ExtraKind = "private" | "studio" | "sigHome" | "sigPage" | "membership" | "retreat";

export interface ExtraRow {
  key: string;
  kind: ExtraKind;
  title: string;
  category: string;
  badge: string;
  subtitle: string;
  image: string | null;
  active: boolean;
  websitePath: string | null;
  index?: number;
  classId?: string;
  classKey?: string;
}

export const EXTRA_CATEGORIES = [
  "Private Classes",
  "Studio Rental",
  "Signature Experiences",
  "Memberships & Passes",
  "Retreats",
];

export const PRIVATE_CLASSES = [
  { id: "one-on-one-private-class", key: "oneOnOne", people: "1 person" },
  { id: "couples-private-class", key: "couples", people: "2 people" },
  { id: "private-group-class", key: "group", people: "4 or more" },
  { id: "gyrotonic-expansion-system", key: "gyrotonic", people: "1 person" },
] as const;

export interface PrivatePricing {
  onePerson: number;
  twoPeople: number;
  upToFour: number;
  extraPerson: number;
}

export const DEFAULT_PRIVATE_PRICING: PrivatePricing = { onePerson: 85, twoPeople: 113, upToFour: 170, extraPerson: 28 };

/** Private class prices in USD; anything missing or invalid keeps today's price. */
export function privatePricing(ps: { pricing?: Partial<Record<keyof PrivatePricing, unknown>> } | null | undefined): PrivatePricing {
  const p = ps?.pricing ?? {};
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    onePerson: num(p.onePerson, DEFAULT_PRIVATE_PRICING.onePerson),
    twoPeople: num(p.twoPeople, DEFAULT_PRIVATE_PRICING.twoPeople),
    upToFour: num(p.upToFour, DEFAULT_PRIVATE_PRICING.upToFour),
    extraPerson: num(p.extraPerson, DEFAULT_PRIVATE_PRICING.extraPerson),
  };
}

/** 1 = one person, 2 = two people, 3–4 = up to four, 5+ = up to four + each extra person. */
export function privatePriceUsd(participants: number, pricing: PrivatePricing): number {
  if (participants <= 1) return pricing.onePerson;
  if (participants === 2) return pricing.twoPeople;
  if (participants <= 4) return pricing.upToFour;
  return pricing.upToFour + (participants - 4) * pricing.extraPerson;
}

export function getIn(obj: any, path: string[]): any {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Returns a copy of `obj` with `value` at `path`, leaving everything else untouched. */
export function setIn<T extends Record<string, any>>(obj: T, path: string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const base = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : ({} as T);
  return { ...base, [head]: setIn((base as any)[head] ?? {}, rest, value) } as T;
}

/**
 * The Spanish copy of a list. The website replaces a whole list with the
 * Spanish one, so every row must be complete: translated fields where given,
 * everything else from English.
 */
export function completeEsList(en: any[], es: any[], translatable: string[]): any[] {
  return en.map((row, i) => {
    const out = { ...row };
    for (const k of translatable) {
      const v = es?.[i]?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
      else if (Array.isArray(v) && v.some((s) => typeof s === "string" && s.trim())) out[k] = v.filter((s) => typeof s === "string" && s.trim());
    }
    return out;
  });
}

/** "$45" → 45 */
export const parseRatePrice = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const offeringTypeLabel: Record<string, string> = {
  membership: "Membership",
  class_pass: "Class pass",
  drop_in: "Drop-in",
};

export function buildExtraRows(
  content: ContentPair,
  offerings: { id: string; name: string; type: string; price: number | string; status: string }[],
  retreats: { id: string; title: string; slug: string; duration_days: number; image_url: string | null; is_active: boolean; pricing_tiers: unknown }[],
): ExtraRow[] {
  const eff = (path: string[]) => getIn(content.en, path) ?? getIn(defaults, path);
  const rows: ExtraRow[] = [];

  const pricing = privatePricing({ pricing: eff(["privateSessions", "pricing"]) });
  for (const pc of PRIVATE_CLASSES) {
    const price =
      pc.key === "couples" ? `$${pricing.twoPeople}` :
      pc.key === "group" ? `$${pricing.upToFour} up to 4 · +$${pricing.extraPerson} each extra` :
      `$${pricing.onePerson}`;
    rows.push({
      key: `private-${pc.id}`,
      kind: "private",
      title: eff(["privateSessions", "classes", pc.key, "title"]) || pc.id,
      category: "Private Classes",
      badge: "Private class",
      subtitle: `${pc.people} · ${price}`,
      image: eff(["privateSessions", "images", pc.id]) || null,
      active: true,
      websitePath: "/private-sessions",
      classId: pc.id,
      classKey: pc.key,
    });
  }

  const rates: any[] = eff(["studioRental", "rates"]) ?? [];
  const ratePrices = rates.map((r) => parseRatePrice(r?.price)).filter((n) => n > 0);
  rows.push({
    key: "studio-rates",
    kind: "studio",
    title: "Studio Rental rates",
    category: "Studio Rental",
    badge: "Rates",
    subtitle: `${rates.length} rates${ratePrices.length ? ` · $${Math.min(...ratePrices)}–$${Math.max(...ratePrices)}` : ""}`,
    image: eff(["studioRental", "studioImage"]) || null,
    active: true,
    websitePath: "/studio-rental",
  });

  ((eff(["signatureExperiences", "items"]) ?? []) as any[]).forEach((it, i) =>
    rows.push({
      key: `sig-home-${i}`,
      kind: "sigHome",
      title: String(it?.title ?? "").replace(/\s*\n\s*/g, " ").trim(),
      category: "Signature Experiences",
      badge: "Homepage card",
      subtitle: String(it?.benefit ?? "").trim(),
      image: it?.image || null,
      active: true,
      websitePath: "/",
      index: i,
    }),
  );

  ((eff(["signatureTreatments", "treatments"]) ?? []) as any[]).forEach((it, i) =>
    rows.push({
      key: `sig-page-${i}`,
      kind: "sigPage",
      title: String(it?.title ?? ""),
      category: "Signature Experiences",
      badge: "Signature page",
      subtitle: it?.comingSoon ? "Coming soon" : String(it?.description ?? "").trim(),
      image: it?.image || null,
      active: true,
      websitePath: "/signature-treatments",
      index: i,
    }),
  );

  for (const o of offerings) {
    rows.push({
      key: `offering-${o.id}`,
      kind: "membership",
      title: o.name,
      category: "Memberships & Passes",
      badge: offeringTypeLabel[o.type] ?? "Offering",
      subtitle: `$${Number(o.price).toLocaleString("en-US")}`,
      image: null,
      active: o.status === "active",
      websitePath: "/classes#buy",
    });
  }

  for (const r of retreats) {
    const from = startingPrice(Array.isArray(r.pricing_tiers) ? (r.pricing_tiers as any) : []);
    rows.push({
      key: `retreat-${r.id}`,
      kind: "retreat",
      title: r.title,
      category: "Retreats",
      badge: "Retreat",
      subtitle: `${r.duration_days} days${from ? ` · from $${from.toLocaleString("en-US")}` : ""}`,
      image: r.image_url,
      active: r.is_active,
      websitePath: `/retreats/${r.slug}`,
    });
  }

  return rows;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterExtraRows(
  rows: ExtraRow[],
  { query = "", category = "all", status = "all" }: { query?: string; category?: string; status?: string },
): ExtraRow[] {
  const q = normalize(query.trim());
  return rows.filter((r) => {
    if (category !== "all" && r.category !== category) return false;
    if (status === "active" && !r.active) return false;
    if (status === "inactive" && r.active) return false;
    return !q || normalize(`${r.title} ${r.category} ${r.badge} ${r.subtitle}`).includes(q);
  });
}
