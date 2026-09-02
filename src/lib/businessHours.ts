// Canonical spa business-hours rules for the booking flow (FRONTEND MIRROR).
//
// This file MUST stay byte-for-byte equivalent to
// `supabase/functions/create-booking/businessHours.ts`. The Deno test
// `slot_parity_test.ts` iterates real generated slot lists and asserts that
// every FE-generated slot passes the BE validator, so any drift will fail CI.
//
// The weekly open/close window is stored in the `business_hours` DB table and
// can be edited from the admin UI. Callers may pass a `WeeklyHours` overrides
// map (weekday → hours) to `checkBusinessHours` / `generateSpaSlots`; when
// omitted we fall back to the hardcoded defaults below so unit tests and any
// callsite that hasn't been wired to the DB yet keep working.

// Holis Wellness Center is in Costa Rica. CR has been on a fixed UTC−6
// offset with NO daylight-saving time since 1992 and there is no active
// proposal to change that. We therefore hardcode the offset rather than
// depending on Intl timezone data at runtime. Update this constant (and
// its mirror on the backend) if that ever changes.
export const SPA_TIMEZONE = "America/Costa_Rica";
export const SPA_UTC_OFFSET_MIN = -360;

export const SAME_DAY_LEAD_MINUTES = 15;
export const SLOT_INTERVAL_MINUTES = 30;

export type SpaLocalParts = {
  year: number;
  month0: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  hhmm: string;
};

export function spaLocalParts(d: Date): SpaLocalParts {
  const shifted = new Date(d.getTime() + SPA_UTC_OFFSET_MIN * 60_000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour,
    minute,
    weekday: shifted.getUTCDay(),
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function spaLocalToInstant(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(Date.UTC(year, month0, day, hour, minute, 0, 0) - SPA_UTC_OFFSET_MIN * 60_000);
}

/**
 * The month a moment falls in, in studio time: "2026-09".
 *
 * Bucketing by the UTC timestamp puts an 8pm class on the last day of the
 * month into the next one, which would bill it to the wrong month.
 */
export function spaMonthKey(d: Date | string | number): string {
  const p = spaLocalParts(new Date(d));
  return `${p.year}-${String(p.month0 + 1).padStart(2, "0")}`;
}

export type BusinessHours = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  isClosed?: boolean;
};

/** Overrides keyed by weekday (0=Sunday..6=Saturday), typically sourced
 *  from the `business_hours` DB table. */
export type WeeklyHours = Partial<Record<number, BusinessHours>>;

const DEFAULT_HOURS: Record<number, BusinessHours> = {
  0: { startHour: 9, startMinute: 0, endHour: 17, endMinute: 30 },
  1: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  2: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  3: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  4: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  5: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  6: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
};

export function getBusinessHours(weekday: number, overrides?: WeeklyHours): BusinessHours {
  return overrides?.[weekday] ?? DEFAULT_HOURS[weekday];
}

/** Parse an "HH:MM" or "HH:MM:SS" string into {hour, minute}. */
export function parseHhmm(s: string): { hour: number; minute: number } {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return { hour: h || 0, minute: m || 0 };
}

/** Convert a DB row from `business_hours` into a {@link BusinessHours}. */
export function rowToBusinessHours(row: {
  weekday: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}): BusinessHours {
  const o = parseHhmm(row.open_time);
  const c = parseHhmm(row.close_time);
  return {
    startHour: o.hour,
    startMinute: o.minute,
    endHour: c.hour,
    endMinute: c.minute,
    isClosed: row.is_closed,
  };
}

export function rowsToWeeklyHours(rows: Array<{
  weekday: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}>): WeeklyHours {
  const out: WeeklyHours = {};
  for (const r of rows) out[r.weekday] = rowToBusinessHours(r);
  return out;
}

export type BusinessHoursCheck = {
  ok: boolean;
  timezone: string;
  weekday: number;
  window_local: { open: string; close: string } | null;
  start_local: string;
  end_local: string;
  duration_minutes: number;
  is_closed: boolean;
};

export function checkBusinessHours(
  start: Date,
  end: Date,
  overrides?: WeeklyHours,
): BusinessHoursCheck {
  const s = spaLocalParts(start);
  const bh = getBusinessHours(s.weekday, overrides);
  const startMin = s.hour * 60 + s.minute;
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);
  const endMin = startMin + durationMin;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (bh.isClosed) {
    return {
      ok: false,
      timezone: SPA_TIMEZONE,
      weekday: s.weekday,
      window_local: null,
      start_local: s.hhmm,
      end_local: `${pad(Math.floor(endMin / 60) % 24)}:${pad(((endMin % 60) + 60) % 60)}`,
      duration_minutes: durationMin,
      is_closed: true,
    };
  }

  const openMin = bh.startHour * 60 + bh.startMinute;
  const closeMin = bh.endHour * 60 + bh.endMinute;
  return {
    ok: startMin >= openMin && endMin <= closeMin,
    timezone: SPA_TIMEZONE,
    weekday: s.weekday,
    window_local: {
      open: `${pad(bh.startHour)}:${pad(bh.startMinute)}`,
      close: `${pad(bh.endHour)}:${pad(bh.endMinute)}`,
    },
    start_local: s.hhmm,
    end_local: `${pad(Math.floor(endMin / 60) % 24)}:${pad(((endMin % 60) + 60) % 60)}`,
    duration_minutes: durationMin,
    is_closed: false,
  };
}

export function generateSpaSlots(
  calendarYear: number,
  calendarMonth0: number,
  calendarDay: number,
  durationMinutes: number,
  now: Date = new Date(),
  overrides?: WeeklyHours,
): Date[] {
  const weekday = new Date(Date.UTC(calendarYear, calendarMonth0, calendarDay)).getUTCDay();
  const bh = getBusinessHours(weekday, overrides);
  if (bh.isClosed) return [];
  const open = spaLocalToInstant(calendarYear, calendarMonth0, calendarDay, bh.startHour, bh.startMinute);
  const close = spaLocalToInstant(calendarYear, calendarMonth0, calendarDay, bh.endHour, bh.endMinute);

  const nowSpa = spaLocalParts(now);
  const isSpaToday =
    nowSpa.year === calendarYear && nowSpa.month0 === calendarMonth0 && nowSpa.day === calendarDay;
  const minStart = isSpaToday ? new Date(now.getTime() + SAME_DAY_LEAD_MINUTES * 60_000) : null;

  const slots: Date[] = [];
  for (let t = open.getTime(); t < close.getTime(); t += SLOT_INTERVAL_MINUTES * 60_000) {
    const slot = new Date(t);
    const slotEnd = new Date(t + durationMinutes * 60_000);
    if (slotEnd.getTime() > close.getTime()) continue;
    if (minStart && slot.getTime() < minStart.getTime()) continue;
    slots.push(slot);
  }
  return slots;
}

/** Convenience: derive the spa-local calendar day from a browser Date and
 *  generate slots for it. Use this in React hooks that receive a `Date`
 *  from the calendar picker. */
export function generateSpaSlotsForCalendarDate(
  calendarDate: Date,
  durationMinutes: number,
  now: Date = new Date(),
  overrides?: WeeklyHours,
): Date[] {
  return generateSpaSlots(
    calendarDate.getFullYear(),
    calendarDate.getMonth(),
    calendarDate.getDate(),
    durationMinutes,
    now,
    overrides,
  );
}

// ---------------------------------------------------------------------------
// Single-source-of-truth display formatters.
//
// Every place in the app that renders a timestamptz for a booking (class start
// times, admin calendar, confirmation emails) MUST format through these
// helpers so the wall-clock the customer sees matches what the spa staff sees
// and what the backend validated against. Never `new Date(iso)` + `format(..)`
// from date-fns for a booking time — that renders in the browser tz.
// ---------------------------------------------------------------------------

const _spaDate = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TIMEZONE, weekday: "short", month: "short", day: "numeric",
});
const _spaDateLong = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TIMEZONE, weekday: "short", month: "short", day: "numeric", year: "numeric",
});
const _spaTime = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true,
});
const _spaFull = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TIMEZONE, weekday: "long", year: "numeric", month: "long",
  day: "numeric", hour: "numeric", minute: "2-digit",
});

function _toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** e.g. "Mon, Jul 6" — for compact card labels. */
export function formatSpaDate(d: Date | string | number): string {
  return _spaDate.format(_toDate(d));
}

/** e.g. "Mon, Jul 6, 2026" — for detail views / summaries. */
export function formatSpaDateLong(d: Date | string | number): string {
  return _spaDateLong.format(_toDate(d));
}

/** e.g. "9:30 AM" — the wall-clock the staff/customer share. */
export function formatSpaTime(d: Date | string | number): string {
  return _spaTime.format(_toDate(d));
}

/** e.g. "Monday, July 6, 2026 at 9:30 AM" — used in confirmation emails. */
export function formatSpaDateTime(d: Date | string | number): string {
  return _spaFull.format(_toDate(d));
}

