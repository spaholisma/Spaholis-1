// The teacher names already on the class schedule, for Admin → Teachers.
//
// A teacher's classes are hers by NAME: whoever is named on a session (or, when
// the session names nobody, on its class) is who teaches it and who pays the
// studio rent. So adding a teacher means using the name exactly as the schedule
// spells it — this reads those spellings, so the Admin can pick one instead of
// typing it, and sees a near-miss ("Melanie" and "Melanie Moss") before it
// costs anyone a class.

export type ScheduleSession = {
  instructor: string | null;
  start_time: string;
  is_cancelled: boolean | null;
  classes: { instructor: string | null } | null;
};

export type ScheduleName = {
  name: string;
  /** Classes still to come. */
  upcoming: number;
  /** Classes already given in the period read. */
  recent: number;
};

const key = (s: string) => s.trim().toLowerCase();

/** A session's teacher: the session's own name wins, else its class's. */
export const nameOnSession = (s: ScheduleSession) =>
  (s.instructor ?? "").trim() || (s.classes?.instructor ?? "").trim();

/**
 * Every name on the schedule that is not a teacher yet, the busiest first.
 * When one name is spelled with different capitals, the commonest spelling wins.
 */
export function namesOnSchedule(
  sessions: ScheduleSession[],
  now: Date,
  existingTeachers: string[],
): ScheduleName[] {
  const taken = new Set(existingTeachers.map(key));
  const byKey = new Map<string, { spellings: Map<string, number>; upcoming: number; recent: number }>();
  for (const s of sessions) {
    if (s.is_cancelled) continue;
    const name = nameOnSession(s);
    if (!name || taken.has(key(name))) continue;
    const e = byKey.get(key(name)) ?? { spellings: new Map(), upcoming: 0, recent: 0 };
    e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
    if (new Date(s.start_time).getTime() >= now.getTime()) e.upcoming += 1;
    else e.recent += 1;
    byKey.set(key(name), e);
  }
  return [...byKey.values()]
    .map((e) => ({
      name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      upcoming: e.upcoming,
      recent: e.recent,
    }))
    .sort((a, b) => b.upcoming - a.upcoming || b.recent - a.recent || a.name.localeCompare(b.name));
}

/** The schedule's entry for exactly this name (capitals aside). */
export function scheduleMatch(name: string, list: ScheduleName[]): ScheduleName | undefined {
  const k = key(name);
  return k ? list.find((n) => key(n.name) === k) : undefined;
}

/**
 * Other spellings that are probably the same person: the same first name
 * ("Melanie" / "Melanie Moss"). Their classes do not count as hers until they
 * are renamed.
 */
export function similarNames(name: string, list: ScheduleName[]): ScheduleName[] {
  const k = key(name);
  const first = k.split(/\s+/)[0];
  if (first.length < 2) return [];
  return list.filter((n) => {
    const nk = key(n.name);
    return nk !== k && nk.split(/\s+/)[0] === first;
  });
}

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
