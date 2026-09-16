// Private class requests (Private Sessions page → Book Now → request form).
//
// For one-on-one, couple's and group private classes the guest may pick one of
// the studio's classes and its teacher. The request is then emailed to that
// teacher, to Holis and to the guest (edge function send-private-class-request).
// "No specific class" is the default — we never pre-select a real class.

export const PRIVATE_KINDS = ["oneOnOne", "couples", "group"] as const;
export type PrivateKind = (typeof PRIVATE_KINDS)[number];

export const NO_CLASS = "none";

export function parsePrivateKind(v: string | null | undefined): PrivateKind | null {
  return (PRIVATE_KINDS as readonly string[]).includes(v ?? "") ? (v as PrivateKind) : null;
}

/** One-on-one is 1 person, couple's is 2, a group is 4 to 20. */
export function clampPeople(v: string | number | null | undefined, kind: PrivateKind): number {
  if (kind === "oneOnOne") return 1;
  if (kind === "couples") return 2;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(4, Math.min(20, n)) : 4;
}

/** A scheduled session with its class attached (same shape the Classes page uses). */
export interface SessionWithClass {
  class_id: string;
  instructor?: string | null;
  classes?: { id: string; title: string; category?: string | null; instructor?: string | null } | null;
}
export interface TeacherRow {
  id: string;
  display_name: string;
  photo_url: string | null;
  bio?: string | null;
}

export interface PrivateClassOption {
  key: string;
  classId: string;
  classTitle: string;
  teacherName: string | null;
  teacherPhoto: string | null;
}

export const cleanName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

// One-off events are not classes you can take privately.
const SKIP_CATEGORY = /workshop|special event/i;

/**
 * The classes actually being taught — built from the scheduled sessions, the
 * same source the Classes page uses, so the list never shows a class that is
 * not running or the same class twice.
 *
 * `recent` are sessions already taught: upcoming sessions often have no
 * teacher on them yet, so the teacher who has been giving the class is used
 * (and the class's own teacher as a last resort). One option per class and
 * teacher: a class taught by two teachers appears once for each, so the
 * request reaches the right one.
 */
export function buildClassOptions(
  sessions: SessionWithClass[],
  teachers: TeacherRow[],
  recent: SessionWithClass[] = [],
): PrivateClassOption[] {
  const photos = new Map(teachers.map((t) => [cleanName(t.display_name).toLowerCase(), t.photo_url]));
  const byClass = new Map<string, { title: string; names: Map<string, string> }>();

  const addName = (entry: { names: Map<string, string> }, raw: string | null | undefined) => {
    const name = cleanName(raw);
    if (name && !entry.names.has(name.toLowerCase())) entry.names.set(name.toLowerCase(), name);
  };

  for (const s of sessions) {
    const cls = s.classes;
    const id = cls?.id ?? s.class_id;
    const title = cleanName(cls?.title);
    if (!id || !title || SKIP_CATEGORY.test(cls?.category ?? "")) continue;
    if (!byClass.has(id)) byClass.set(id, { title, names: new Map() });
    addName(byClass.get(id)!, s.instructor);
  }

  // Only fills in teachers for classes already on the schedule.
  for (const s of recent) {
    const entry = byClass.get(s.classes?.id ?? s.class_id);
    if (entry) addName(entry, s.instructor);
  }
  for (const s of sessions) {
    const entry = byClass.get(s.classes?.id ?? s.class_id);
    if (entry && entry.names.size === 0) addName(entry, s.classes?.instructor);
  }

  const out: PrivateClassOption[] = [];
  for (const [classId, { title, names }] of byClass) {
    if (!names.size) {
      out.push({ key: `${classId}::`, classId, classTitle: title, teacherName: null, teacherPhoto: null });
      continue;
    }
    for (const [k, name] of names) {
      out.push({ key: `${classId}::${k}`, classId, classTitle: title, teacherName: name, teacherPhoto: photos.get(k) ?? null });
    }
  }
  return out.sort(
    (a, b) => a.classTitle.localeCompare(b.classTitle) || (a.teacherName ?? "~").localeCompare(b.teacherName ?? "~"),
  );
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/** What the booking row keeps, so the email function and the admin see the choice. */
export function privateClassIntake(input: {
  kind: PrivateKind;
  kindTitle: string;
  people: number;
  option: PrivateClassOption | null;
  preferred: string;
}) {
  return {
    private_class: {
      kind: input.kind,
      kind_title: input.kindTitle,
      people: input.people,
      class_id: input.option?.classId ?? null,
      class_title: input.option?.classTitle ?? null,
      teacher_name: input.option?.teacherName ?? null,
      preferred: input.preferred || null,
    },
  };
}
