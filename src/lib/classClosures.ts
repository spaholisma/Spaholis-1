import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Days the studio is closed for classes.
 *
 * One row per day, dated in Costa Rica time. The database refuses any booking
 * or session on these days; the website uses this list to hide them so nobody
 * gets as far as trying.
 */
export interface ClassClosure {
  id: string;
  closed_date: string; // YYYY-MM-DD, Costa Rica
  reason: string | null;
}

/** The Costa Rica calendar date (YYYY-MM-DD) of an instant. */
export const spaDateKey = (d: Date | string | number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(d));

// Generated types predate the table.
const closuresTable = () => supabase.from("class_closures" as any) as any;

export async function fetchClassClosures(): Promise<ClassClosure[]> {
  const { data, error } = await closuresTable().select("id, closed_date, reason").order("closed_date");
  if (error) throw error;
  return (data ?? []) as ClassClosure[];
}

/** The closed dates as a set, for quick "is this day closed?" checks. */
export async function fetchClosedClassDays(): Promise<Set<string>> {
  try {
    return new Set((await fetchClassClosures()).map((c) => c.closed_date));
  } catch {
    // The list only hides days on the website; the database still refuses the
    // booking, so a failed read must not take the class pages down.
    return new Set();
  }
}

export function useClassClosures() {
  return useQuery({
    queryKey: ["class-closures"],
    queryFn: fetchClassClosures,
    staleTime: 60_000,
  });
}

export interface ClosureRange {
  from: string;
  to: string;
  message: string | null;
}

/**
 * Consecutive closed days with the same message, merged into ranges — so the
 * schedule can say "Closed October 16 – 31" once instead of sixteen times.
 */
export function closureRanges(closures: ClassClosure[]): ClosureRange[] {
  const sorted = [...closures].sort((a, b) => a.closed_date.localeCompare(b.closed_date));
  const out: ClosureRange[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    const nextDay = last ? datesBetween(last.to, c.closed_date).length === 2 : false;
    if (last && nextDay && (last.message ?? "") === (c.reason ?? "")) last.to = c.closed_date;
    else out.push({ from: c.closed_date, to: c.closed_date, message: c.reason });
  }
  return out;
}

/** Every date from `from` to `to` inclusive, as YYYY-MM-DD. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const cur = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));
  while (cur <= end && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
