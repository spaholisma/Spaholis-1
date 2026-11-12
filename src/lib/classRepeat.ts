/**
 * Repeating a class session: "every Monday (and Wednesday) until December 20".
 *
 * The admin picks the first date, the weekdays and the last date; every date in
 * between that falls on one of those weekdays gets a session at the same time.
 * Closed days are skipped (the database refuses a session on them anyway), and
 * so is a date where the same class already starts at the same time — so
 * running it twice never doubles the schedule.
 */

/** 0 = Sunday … 6 = Saturday, as Date#getDay. */
export const WEEKDAYS = [
  { day: 0, short: "Sun" }, { day: 1, short: "Mon" }, { day: 2, short: "Tue" }, { day: 3, short: "Wed" },
  { day: 4, short: "Thu" }, { day: 5, short: "Fri" }, { day: 6, short: "Sat" },
] as const;

/** Most sessions one repeat may create: a year of a daily class. */
export const MAX_REPEAT_SESSIONS = 366;

const toUTC = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

/** The weekday (0–6) of a YYYY-MM-DD date. */
export const weekdayOf = (key: string) => toUTC(key).getUTCDay();

/**
 * Every date from `first` to `until` (both included) that falls on one of
 * `weekdays`, as YYYY-MM-DD. Empty when `until` is before `first`.
 */
export function repeatDates(first: string, weekdays: number[], until: string, max = MAX_REPEAT_SESSIONS + 1): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return [];
  const days = new Set(weekdays);
  const out: string[] = [];
  const cur = toUTC(first);
  const end = toUTC(until);
  while (cur <= end && out.length < max) {
    if (days.has(cur.getUTCDay())) out.push(keyOf(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export interface RepeatPlan {
  /** Dates that get a new session. */
  create: string[];
  /** Dates skipped because the studio is closed for classes. */
  closed: string[];
  /** Dates skipped because this class already starts then. */
  existing: string[];
  /** More dates than one repeat may create. */
  tooMany: boolean;
}

/**
 * Which of the dates get a session. `existingStarts` holds "YYYY-MM-DD HH:mm"
 * of the sessions this class already has (not cancelled).
 */
export function planRepeat(
  dates: string[], time: string, closedDays: Set<string>, existingStarts: Set<string> = new Set(),
): RepeatPlan {
  const plan: RepeatPlan = { create: [], closed: [], existing: [], tooMany: dates.length > MAX_REPEAT_SESSIONS };
  for (const d of dates.slice(0, MAX_REPEAT_SESSIONS)) {
    if (closedDays.has(d)) plan.closed.push(d);
    else if (existingStarts.has(`${d} ${time}`)) plan.existing.push(d);
    else plan.create.push(d);
  }
  return plan;
}
