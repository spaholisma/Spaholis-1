// Searching the internal calendars, the way Google Calendar does it: type
// anything and get every entry that mentions it, whatever month it sits in.
//
// The calendar grid only ever loads the month on screen, so search cannot read
// from it — it asks the database directly, across all dates. The pieces here
// are the parts with no network in them, so they can be tested.
import type { CalendarEntry } from "../AdminInternalCalendars";

/**
 * What a person types is not a query language. Commas and brackets are what
 * PostgREST uses to separate filters, and `%` is a wildcard — left in, they
 * would break the search or quietly match everything.
 */
export function sanitizeTerm(raw: string): string {
  return String(raw ?? "")
    .replace(/[,()%*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fields worth searching on a hand-made entry. */
export const ENTRY_FIELDS = ["title", "notes", "client_name", "offsite_location"] as const;

/** The PostgREST `or` filter for a term across those fields. */
export function buildEntryFilter(term: string): string {
  const t = sanitizeTerm(term);
  return ENTRY_FIELDS.map((f) => `${f}.ilike.%${t}%`).join(",");
}

/** Same idea for the website bookings shown on the Treatments calendar. */
export const BOOKING_FIELDS = ["title", "guest_name", "guest_email", "notes"] as const;

export function buildBookingFilter(term: string): string {
  const t = sanitizeTerm(term);
  return BOOKING_FIELDS.map((f) => `${f}.ilike.%${t}%`).join(",");
}

/** Under two letters everything matches, which is no help to anybody. */
export function isSearchable(raw: string): boolean {
  return sanitizeTerm(raw).length >= 2;
}

export type SearchHit = {
  entry: CalendarEntry;
  /** Which field the term was found in, and the text around it. */
  field: string;
  snippet: string;
};

const LABELS: Record<string, string> = {
  title: "Title",
  notes: "Notes",
  client_name: "Client",
  offsite_location: "Location",
  guest_name: "Client",
  guest_email: "Email",
};

/**
 * Where the term actually appears, with a little text on either side — the
 * point of a search result is to show WHY it matched, not just that it did.
 */
export function describeMatch(entry: CalendarEntry, term: string): { field: string; snippet: string } {
  const t = sanitizeTerm(term).toLowerCase();
  const candidates: [string, unknown][] = [
    ["title", entry.title],
    ["client_name", (entry as any).client_name],
    ["notes", entry.notes],
    ["offsite_location", entry.offsite_location],
    ["guest_name", entry.booking?.guest_name],
    ["guest_email", (entry.booking as any)?.guest_email],
  ];
  for (const [field, value] of candidates) {
    const text = String(value ?? "");
    const at = text.toLowerCase().indexOf(t);
    if (at === -1) continue;
    if (field === "title") return { field: LABELS[field], snippet: text };
    // A note can be long: show the term with ~30 characters of context.
    const from = Math.max(0, at - 30);
    const to = Math.min(text.length, at + t.length + 30);
    return {
      field: LABELS[field] ?? field,
      snippet: (from > 0 ? "…" : "") + text.slice(from, to).trim() + (to < text.length ? "…" : ""),
    };
  }
  return { field: LABELS.title, snippet: entry.title };
}

/**
 * Closest to today first, in both directions.
 *
 * A spa searches for two things: what is coming up, and what happened recently.
 * Sorting by date alone buries one of them under a year of the other; sorting
 * by distance from today keeps both within reach, with the future winning ties
 * because that is the one you can still act on.
 */
export function rankByCloseness(hits: SearchHit[], today = new Date()): SearchHit[] {
  const todayKey = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const distance = (hit: SearchHit) => {
    const [y, m, d] = hit.entry.entry_date.split("-").map(Number);
    if (!y || !m || !d) return Number.MAX_SAFE_INTEGER;
    const days = (Date.UTC(y, m - 1, d) - todayKey) / 86400000;
    // Future ties beat past ones: 3 days ahead sorts before 3 days behind.
    return Math.abs(days) * 2 + (days < 0 ? 1 : 0);
  };
  return [...hits].sort((a, b) => {
    const diff = distance(a) - distance(b);
    if (diff !== 0) return diff;
    return String(a.entry.start_time).localeCompare(String(b.entry.start_time));
  });
}

/** Drop the same entry appearing twice (an entry and its booking twin). */
export function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.entry.id)) return false;
    seen.add(h.entry.id);
    return true;
  });
}

/** "Thu 24 Sep 2026" — enough to place a result without opening it. */
export function resultDateLabel(entryDate: string): string {
  const [y, m, d] = entryDate.split("-").map(Number);
  if (!y || !m || !d) return entryDate;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}
