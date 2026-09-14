// Helpers for the admin Services tab: one list with every service the site
// sells (treatments, packages, programs, experiences, add-ons, courses,
// workshops — active or not), with search and filters, and a link to where
// each one appears on the website.

import { TREATMENT_CATEGORY_SLUGS, treatmentCategoryPath } from "@/lib/treatmentCategories";
import { WELLNESS_PROGRAMS_PATH } from "@/lib/wellnessPrograms";

export interface AdminServiceLike {
  title: string;
  title_es?: string | null;
  description?: string | null;
  category: string;
  type?: string | null;
  is_active: boolean;
  is_addon?: boolean | null;
  sort_order: number;
}

// The order categories appear in the filter and the list.
export const CATEGORY_ORDER = [
  "Massage Therapy",
  "Organic Facials",
  "Body Treatments",
  "Holistic Therapy",
  "Wellness Programs",
  "Spa Packages",
  "Add-ons",
  "Manuel Antonio Experiences",
  "course",
  "workshop",
];

export const SERVICE_TYPES = ["treatment", "program", "experience", "course", "workshop"];

export const categoryLabel = (c: string) => (c === "course" ? "Courses" : c === "workshop" ? "Workshops" : c);

/** Every category in use, known ones first, so no service is ever hidden or mislabelled. */
export function categoryOptions(services: AdminServiceLike[], current?: string): string[] {
  const inUse = new Set(services.map((s) => s.category).filter(Boolean));
  if (current) inUse.add(current);
  const known = CATEGORY_ORDER.filter((c) => inUse.has(c) || !current);
  const extra = [...inUse].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...new Set([...CATEGORY_ORDER.filter((c) => known.includes(c) || inUse.has(c)), ...extra])];
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type StatusFilter = "all" | "active" | "inactive";

export function filterServices<T extends AdminServiceLike>(
  services: T[],
  { query = "", category = "all", status = "all" }: { query?: string; category?: string; status?: StatusFilter },
): T[] {
  const q = normalize(query.trim());
  return services.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (status === "active" && !s.is_active) return false;
    if (status === "inactive" && s.is_active) return false;
    if (!q) return true;
    return normalize([s.title, s.title_es ?? "", s.category, s.description ?? ""].join(" ")).includes(q);
  });
}

export function sortServices<T extends AdminServiceLike>(services: T[]): T[] {
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...services].sort(
    (a, b) => rank(a.category) - rank(b.category) || a.sort_order - b.sort_order || a.title.localeCompare(b.title),
  );
}

/** Where the service is shown on the website, or null for things that have no page (add-ons). */
export function serviceWebsitePath(s: AdminServiceLike): string | null {
  if (s.is_addon || s.category === "Add-ons") return null;
  if (s.type === "course" || s.type === "workshop") return "/education";
  if (s.type === "experience" || s.category === "Manuel Antonio Experiences") return "/retreats?tab=experiences";
  if (s.category === "Wellness Programs") return WELLNESS_PROGRAMS_PATH;
  if (TREATMENT_CATEGORY_SLUGS[s.category]) return treatmentCategoryPath(s.category);
  return "/treatments-therapies";
}

/** Empty Spanish text is saved as null so the website falls back to English. */
export const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);
export const richOrNull = (v: { html?: string } | null | undefined) =>
  v && typeof v.html === "string" && v.html.replace(/<[^>]*>/g, "").trim() ? v : null;
