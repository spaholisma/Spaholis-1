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

export interface ClassRow {
  id: string;
  title: string;
  category: string | null;
  instructor: string | null;
  image_url?: string | null;
}
export interface SessionRow {
  class_id: string;
  instructor: string | null;
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

/**
 * One option per class and teacher. A class taught by two teachers appears
 * twice, so the request reaches the right one. The teacher named on the
 * class's sessions wins over the class template; a class with no teacher
 * still appears ("teacher to be confirmed"). Workshops are one-off events,
 * not classes to take privately, so they are left out.
 */
export function buildClassOptions(classes: ClassRow[], sessions: SessionRow[], teachers: TeacherRow[]): PrivateClassOption[] {
  const photos = new Map(teachers.map((t) => [cleanName(t.display_name).toLowerCase(), t.photo_url]));
  const out: PrivateClassOption[] = [];
  for (const c of classes) {
    if ((c.category ?? "").toLowerCase().includes("workshop")) continue;
    const names = new Map<string, string>();
    for (const s of sessions) {
      const n = cleanName(s.instructor);
      if (s.class_id === c.id && n && !names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
    }
    const fallback = cleanName(c.instructor);
    if (!names.size && fallback) names.set(fallback.toLowerCase(), fallback);
    const classTitle = cleanName(c.title);
    if (!names.size) {
      out.push({ key: `${c.id}::`, classId: c.id, classTitle, teacherName: null, teacherPhoto: null });
    } else {
      for (const [k, n] of names) {
        out.push({ key: `${c.id}::${k}`, classId: c.id, classTitle, teacherName: n, teacherPhoto: photos.get(k) ?? null });
      }
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
