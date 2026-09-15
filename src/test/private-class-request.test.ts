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

const classes = [
  { id: "hatha", title: "Hatha Yoga", category: "Studio Classes", instructor: null },
  { id: "aerial", title: "Aerial Yoga + Floating Gong Bath", category: "Yoga", instructor: null },
  { id: "yin", title: "Yin Yoga", category: "Studio Classes", instructor: null },
  { id: "chakra", title: "Chakradance with Petra Era", category: "Workshop", instructor: "Petra Era" },
  { id: "vinyasa", title: "Vinyasa  Yoga", category: "Studio Classes", instructor: "Ana Ruiz" },
];
const sessions = [
  { class_id: "hatha", instructor: "Melanie Moss" },
  { class_id: "hatha", instructor: " melanie moss " },
  { class_id: "aerial", instructor: "Kerri Michie" },
  { class_id: "aerial", instructor: "Kataleia Dragonfly" },
  { class_id: "yin", instructor: "" },
];
const teachers = [{ id: "t1", display_name: "Kerri Michie", photo_url: "https://x/kerri.jpg" }];

describe("classes and teachers in the dropdown", () => {
  const options = buildClassOptions(classes, sessions, teachers);

  it("shows each class with its teacher, one option per teacher", () => {
    expect(options.map((o) => `${o.classTitle} | ${o.teacherName ?? "—"}`)).toEqual([
      "Aerial Yoga + Floating Gong Bath | Kataleia Dragonfly",
      "Aerial Yoga + Floating Gong Bath | Kerri Michie",
      "Hatha Yoga | Melanie Moss",
      "Vinyasa Yoga | Ana Ruiz",
      "Yin Yoga | —",
    ]);
  });

  it("leaves workshops out and uses the teacher's photo when she has one", () => {
    expect(options.some((o) => o.classTitle.startsWith("Chakradance"))).toBe(false);
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
    expect(read("src/components/booking/PrivateClassPicker.tsx")).toContain("value={value?.key ?? NO_CLASS}");
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
