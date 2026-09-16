import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildClassOptions, clampPeople, initials, parsePrivateKind, privateClassIntake,
} from "@/lib/privateClassRequest";

// Private Sessions → Book Now: pick a class and its teacher, and the request
// is emailed to the teacher, to Holis and to the guest.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

// Sessions on the schedule, the same source the Classes page uses.
const session = (classId: string, title: string, instructor: string | null, category = "Studio Classes") => ({
  class_id: classId,
  instructor,
  classes: { id: classId, title, category, instructor: null },
});
// Upcoming sessions: often no teacher on them yet.
const sessions = [
  session("hatha", "Hatha Yoga", null),
  session("aerial", "Aerial Yoga + Floating Gong Bath", "Kerri Michie", "Yoga"),
  session("aerial", "Aerial Yoga + Floating Gong Bath", null, "Yoga"),
  session("vinyasa", "Vinyasa  Yoga", null),
  session("chakra", "Chakradance with Petra Era", "Petra Era", "Workshop"),
  session("breath", "Breathwork with Anja", "Anja Diggelmann", "Special Event"),
];
// Already taught: who has been giving each class.
const recent = [
  session("hatha", "Hatha Yoga", "Melanie Moss"),
  session("hatha", "Hatha Yoga", " melanie moss "),
  session("aerial", "Aerial Yoga + Floating Gong Bath", "Kataleia Dragonfly", "Yoga"),
  session("yin", "Yin Yoga", "Someone Else"),
];
const teachers = [{ id: "t1", display_name: "Kerri Michie", photo_url: "https://x/kerri.jpg" }];

describe("classes and teachers in the dropdown", () => {
  const options = buildClassOptions(sessions, teachers, recent);

  it("lists each class once, with its teacher, from the classes being taught", () => {
    expect(options.map((o) => `${o.classTitle} | ${o.teacherName ?? "—"}`)).toEqual([
      "Aerial Yoga + Floating Gong Bath | Kataleia Dragonfly",
      "Aerial Yoga + Floating Gong Bath | Kerri Michie",
      "Hatha Yoga | Melanie Moss",
      "Vinyasa Yoga | —",
    ]);
  });

  it("never shows a class that is not on the schedule", () => {
    // Active in the database but with no upcoming sessions — e.g. Yin Yoga,
    // Vinyasa Flow — even when someone taught it recently.
    expect(buildClassOptions([], teachers, recent)).toEqual([]);
    expect(options.some((o) => o.classId === "yin")).toBe(false);
  });

  it("falls back to the class's own teacher when nobody taught it recently", () => {
    const withClassTeacher = [{ class_id: "yin", instructor: null, classes: { id: "yin", title: "Yin Yoga", category: "Studio Classes", instructor: "Ana Ruiz" } }];
    expect(buildClassOptions(withClassTeacher, teachers).map((o) => o.teacherName)).toEqual(["Ana Ruiz"]);
  });

  it("leaves workshops and one-off events out, and uses the teacher's photo", () => {
    expect(options.some((o) => o.classTitle.startsWith("Chakradance"))).toBe(false);
    expect(options.some((o) => o.classTitle.startsWith("Breathwork"))).toBe(false);
    expect(options.find((o) => o.teacherName === "Kerri Michie")?.teacherPhoto).toBe("https://x/kerri.jpg");
    expect(initials("Melanie Moss")).toBe("MM");
  });
});

describe("which private classes get the picker", () => {
  it("one-on-one, couple's and group only — not GYROTONIC", () => {
    expect(parsePrivateKind("oneOnOne")).toBe("oneOnOne");
    expect(parsePrivateKind("couples")).toBe("couples");
    expect(parsePrivateKind("group")).toBe("group");
    expect(parsePrivateKind("gyrotonic")).toBeNull();
    expect(parsePrivateKind(null)).toBeNull();
  });

  it("keeps the number of people sensible", () => {
    expect(clampPeople("5", "oneOnOne")).toBe(1);
    expect(clampPeople("9", "couples")).toBe(2);
    expect(clampPeople("6", "group")).toBe(6);
    expect(clampPeople("2", "group")).toBe(4);
    expect(clampPeople("99", "group")).toBe(20);
    expect(clampPeople("abc", "group")).toBe(4);
  });

  it("saves 'no specific class' as the default choice", () => {
    expect(privateClassIntake({ kind: "couples", kindTitle: "Couple's Private Class", people: 2, option: null, preferred: "" }).private_class)
      .toEqual({ kind: "couples", kind_title: "Couple's Private Class", people: 2, class_id: null, class_title: null, teacher_name: null, preferred: null });
  });

  it("the Private Sessions page passes the kind, except for GYROTONIC", () => {
    const page = read("src/pages/PrivateClasses.tsx");
    expect(page).toContain('cls.i18nKey !== "gyrotonic" ? `&private=${cls.i18nKey}&people=${count}` : ""');
  });

  it("the request form defaults to no class and calls the email function with the booking id only", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toContain('supabase.functions.invoke("send-private-class-request", { body: { bookingId } })');
    const picker = read("src/components/booking/PrivateClassPicker.tsx");
    // Nothing is picked until the guest picks it.
    expect(picker).toContain("onClick={() => pick(null)}");
    // Same source as the Classes page, so the two lists can never disagree.
    expect(picker).toContain("useWeekEvents()");
    // A plain scrolling list, so the wheel and a finger move it normally.
    expect(picker).toContain("overflow-y-auto overscroll-contain");
    expect(picker).not.toContain("@/components/ui/select");
  });
});

describe("the three emails", () => {
  const fn = read("supabase/functions/send-private-class-request/index.ts");

  it("emails the teacher, Holis and the guest", () => {
    expect(fn).toContain("// 1. The teacher");
    expect(fn).toContain("// 2. Holis");
    expect(fn).toContain("// 3. The guest");
    expect(fn).toContain('const TEAM = ["info@spaholis.com", "spaholisma@gmail.com"]');
  });

  it("trusts nothing from the browser: fresh request, sent once, real teacher, email from the database", () => {
    expect(fn).toContain('.is("notification_sent_at", null)');
    expect(fn).toContain("MAX_AGE_MINUTES");
    expect(fn).toContain("teaches.has(norm(pc.teacher_name))");
    expect(fn).toContain('from("teachers").select("display_name, email, active")');
    expect(fn).not.toMatch(/body\?\.(teacherEmail|email|guestEmail)/);
  });
});
