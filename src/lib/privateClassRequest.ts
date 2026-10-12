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
  start_time?: string | null;
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
 * not running.
 *
 * ONE option per class, with ONE teacher: the teacher on the next session,
 * else the class's own teacher, else whoever taught it most recently
 * (`recent`, newest first). The schedule spells the same teacher several ways
 * ("Kerri", "Kerri Michie", "Kerry") and has the odd cover, so listing every
 * name made each class appear two or three times.
 */
export function buildClassOptions(
  sessions: SessionWithClass[],
  teachers: TeacherRow[],
  recent: SessionWithClass[] = [],
  now: Date = new Date(),
): PrivateClassOption[] {
  const photos = new Map(teachers.map((t) => [cleanName(t.display_name).toLowerCase(), t.photo_url]));
  const byClass = new Map<string, { title: string; next: string; own: string; last: string }>();
  const nowMs = now.getTime();

  // The schedule, soonest first: the first upcoming session with a teacher names her.
  const ordered = [...sessions].sort((a, b) =>
    (a.start_time ? Date.parse(a.start_time) : 0) - (b.start_time ? Date.parse(b.start_time) : 0));
  for (const s of ordered) {
    const cls = s.classes;
    const id = cls?.id ?? s.class_id;
    const title = cleanName(cls?.title);
    if (!id || !title || SKIP_CATEGORY.test(cls?.category ?? "")) continue;
    if (!byClass.has(id)) byClass.set(id, { title, next: "", own: "", last: "" });
    const e = byClass.get(id)!;
    const upcoming = !s.start_time || Date.parse(s.start_time) >= nowMs;
    if (!e.next && upcoming) e.next = cleanName(s.instructor);
    if (!e.own) e.own = cleanName(cls?.instructor);
  }
  // Only fills in teachers for classes already on the schedule.
  for (const s of recent) {
    const e = byClass.get(s.classes?.id ?? s.class_id);
    if (e && !e.last) e.last = cleanName(s.instructor);
  }

  const out: PrivateClassOption[] = [];
  for (const [classId, e] of byClass) {
    const name = e.next || e.own || e.last;
    out.push(name
      ? { key: `${classId}::${name.toLowerCase()}`, classId, classTitle: e.title, teacherName: name, teacherPhoto: photos.get(name.toLowerCase()) ?? null }
      : { key: `${classId}::`, classId, classTitle: e.title, teacherName: null, teacherPhoto: null });
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
  /** What was picked: her own private class (priced again on the server —
   *  nothing about money is stored from here), or her class on the schedule. */
  choice: { offering: { id: string } | null; classId: string | null; title: string; teacherName: string | null } | null;
  preferred: string;
  /** Where it happens; the address only for the guest's own place. */
  location?: { place: "studio" | "client" | "beach"; label: string; address: string | null } | null;
  /** The guest's ID — a Costa Rican cédula gets the teacher's local discount
   *  (priced again on the server, like everything about money). */
  idDocument?: { type: "cr_cedula" | "other" | null; number: string } | null;
  /** One of the teacher's coupons, as typed (checked on the server). */
  coupon?: string | null;
}) {
  return {
    private_class: {
      kind: input.kind,
      kind_title: input.kindTitle,
      people: input.people,
      offering_id: input.choice?.offering?.id ?? null,
      class_id: input.choice?.classId ?? null,
      class_title: input.choice?.title ?? null,
      teacher_name: input.choice?.teacherName ?? null,
      preferred: input.preferred || null,
      location: input.location?.place ?? null,
      location_label: input.location?.label ?? null,
      location_address: input.location?.place === "client" ? (input.location.address?.trim() || null) : null,
      id_document: input.idDocument?.number.trim().slice(0, 30) || null,
      id_document_type: input.idDocument?.type ?? null,
      coupon_code: (input.coupon || "").trim().toUpperCase().slice(0, 64) || null,
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
