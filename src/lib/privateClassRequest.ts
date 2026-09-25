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

/** A class that can be taken privately (not a workshop or special event). */
export const canBookPrivately = (category: string | null | undefined) => !SKIP_CATEGORY.test(category ?? "");

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
  /** The teacher's private class that was picked, if any. Its price is worked
   *  out again on the server; nothing about money is stored from here. */
  offering: { id: string; class_id: string | null; title: string; teacher_name: string } | null;
  preferred: string;
}) {
  return {
    private_class: {
      kind: input.kind,
      kind_title: input.kindTitle,
      people: input.people,
      offering_id: input.offering?.id ?? null,
      class_id: input.offering?.class_id ?? null,
      class_title: input.offering?.title ?? null,
      teacher_name: input.offering?.teacher_name ?? null,
      preferred: input.preferred || null,
    },
  };
}

/**
 * The option a link asked for — a teacher's portfolio sends ?class=…&teacher=… —
 * when the schedule offers it. A teacher who was named but is not found picks
 * nothing, so a request never goes to somebody else by accident.
 */
export function findOption(
  options: PrivateClassOption[],
  classId: string | null | undefined,
  teacherName: string | null | undefined,
): PrivateClassOption | null {
  if (!classId) return null;
  const k = cleanName(teacherName).toLowerCase();
  return options.find((o) => o.classId === classId && (k ? (o.teacherName ?? "").toLowerCase() === k : true)) ?? null;
}

/** The request page for a private class, with its class and teacher chosen. */
export function privateRequestPath(o: {
  kind: PrivateKind;
  kindTitle: string;
  people: number;
  offeringId?: string | null;
  classId?: string | null;
  teacherName?: string | null;
}): string {
  const topic = `Private Class: ${o.kindTitle} – ${o.people} ${o.people === 1 ? "person" : "people"}`;
  const q = new URLSearchParams({ service: "consultation", topic, private: o.kind, people: String(o.people) });
  if (o.offeringId) q.set("offering", o.offeringId);
  if (o.classId) q.set("class", o.classId);
  if (o.teacherName) q.set("teacher", cleanName(o.teacherName));
  return `/book?${q.toString()}`;
}
