// Validates that the duration encoded in a service title (e.g. "(60min)", "(90min)", "(2hr)", "(120min)")
// exactly matches the service's duration_minutes field used by the booking time-slot generator.
//
// Returns null when the title is valid (or validation does not apply), or a human-readable
// problem string when there is a mismatch the admin should fix.

export interface ValidatableService {
  title: string;
  duration_minutes: number | null;
  type?: string | null;
  category?: string | null;
  is_addon?: boolean | null;
}

// Types/categories that are NOT booked as an individual timed slot, so their
// titles are brand/course names and don't need a duration suffix:
//  - experiences, programs, workshops, and multi-session courses
//  - Spa Packages (branded bundles — duration shows in the package detail)
//  - Add-ons (extras attached to a treatment, never booked on their own)
const SKIP_TYPES = new Set(["experience", "program", "workshop", "course"]);
const SKIP_CATEGORIES = new Set([
  "Manuel Antonio Experiences",
  "Wellness Programs",
  "Spa Packages",
  "Add-ons",
  "course",
]);

/**
 * Parse the duration (in minutes) declared inside the title's parentheses.
 * Accepts: (60min) (90 min) (2hr) (2 hrs) (1h30) (120min)
 * Returns null when no duration token is present.
 */
export function parseTitleDuration(title: string): number | null {
  const m = title.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const inside = m[1].toLowerCase().replace(/\s+/g, "");

  // h+min form: 1h30, 2h15
  const hm = inside.match(/^(\d+)h(\d+)$/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);

  // pure hours: 2hr, 2hrs, 2h
  const h = inside.match(/^(\d+)(?:hrs?|h)$/);
  if (h) return parseInt(h[1], 10) * 60;

  // pure minutes: 60min, 90mins, 45m
  const min = inside.match(/^(\d+)(?:mins?|m)$/);
  if (min) return parseInt(min[1], 10);

  return null;
}

export function validateServiceTitle(s: ValidatableService): string | null {
  if (s.is_addon) return null;
  if (s.type && SKIP_TYPES.has(s.type)) return null;
  if (s.category && SKIP_CATEGORIES.has(s.category)) return null;
  if (!s.duration_minutes) return "Missing duration_minutes";

  const declared = parseTitleDuration(s.title);
  if (declared == null) {
    return `Title is missing a duration suffix like "(${s.duration_minutes}min)"`;
  }
  if (declared !== s.duration_minutes) {
    return `Title says ${declared}min but duration_minutes is ${s.duration_minutes}`;
  }
  return null;
}
