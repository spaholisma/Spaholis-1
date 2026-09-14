// Each Treatments & Therapies category has its own shareable page, e.g.
// /treatments-therapies/massage-therapy — used by the menu, Linktree and any
// link sent to clients. The old ?category= links forward to these.

export const TREATMENTS_PATH = "/treatments-therapies";

export const TREATMENT_CATEGORY_SLUGS: Record<string, string> = {
  "Massage Therapy": "massage-therapy",
  "Organic Facials": "organic-facials",
  "Body Treatments": "body-treatments",
  "Holistic Therapy": "holistic-therapy",
  "Wellness Programs": "wellness-programs",
  "Spa Packages": "spa-packages",
};

// Other spellings people are likely to type; they forward to the real page.
const SLUG_ALIASES: Record<string, string> = {
  "organic-facial": "Organic Facials",
  "facials": "Organic Facials",
  "facial": "Organic Facials",
  "massage": "Massage Therapy",
  "massages": "Massage Therapy",
  "body-treatment": "Body Treatments",
  "holistic-therapies": "Holistic Therapy",
  "wellness-program": "Wellness Programs",
  "spa-package": "Spa Packages",
  "packages": "Spa Packages",
};

export function slugifyCategory(category: string): string {
  return (
    TREATMENT_CATEGORY_SLUGS[category] ??
    category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  );
}

/** The category a URL slug points to, or null if it is not one. */
export function categoryFromSlug(slug: string): string | null {
  const s = slug.toLowerCase();
  const exact = Object.entries(TREATMENT_CATEGORY_SLUGS).find(([, v]) => v === s);
  if (exact) return exact[0];
  return SLUG_ALIASES[s] ?? null;
}

export const treatmentCategoryPath = (category: string) =>
  `${TREATMENTS_PATH}/${slugifyCategory(category)}`;
