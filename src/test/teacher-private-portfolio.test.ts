import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canBookPrivately, findOption, privateRequestPath, type PrivateClassOption } from "@/lib/privateClassRequest";

// Classes page → a teacher's portfolio → "Private class" on each of her classes:
// the private-class prices, then the request page with her class already chosen.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const option = (classId: string, teacherName: string | null): PrivateClassOption => ({
  key: `${classId}::${teacherName ?? ""}`, classId, classTitle: "Cocoon Sound Bath", teacherName, teacherPhoto: null,
});

describe("which classes can be taken privately", () => {
  it("a regular class can; a workshop or special event cannot", () => {
    expect(canBookPrivately("yoga")).toBe(true);
    expect(canBookPrivately(null)).toBe(true);
    expect(canBookPrivately("Workshop")).toBe(false);
    expect(canBookPrivately("Special Event")).toBe(false);
  });
});

describe("the link to the request", () => {
  it("carries the kind, the people, her class and her name", () => {
    const path = privateRequestPath({
      kind: "group", kindTitle: "Private Group Class", people: 6, classId: "c1", teacherName: " Kataleia  Dragonfly ",
    });
    const q = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/book?")).toBe(true);
    expect(q.get("service")).toBe("consultation");
    expect(q.get("private")).toBe("group");
    expect(q.get("people")).toBe("6");
    expect(q.get("class")).toBe("c1");
    expect(q.get("teacher")).toBe("Kataleia Dragonfly");
    expect(q.get("topic")).toBe("Private Class: Private Group Class – 6 people");
  });

  it("says “person” for one", () => {
    const q = new URLSearchParams(privateRequestPath({ kind: "oneOnOne", kindTitle: "One-on-One", people: 1 }).split("?")[1]);
    expect(q.get("topic")).toBe("Private Class: One-on-One – 1 person");
    expect(q.get("class")).toBeNull();
  });
});

describe("arriving on the request page", () => {
  const options = [option("c1", "Kataleia Dragonfly"), option("c1", "Evelina"), option("c2", null)];

  it("chooses her class with her, capitals and spaces aside", () => {
    expect(findOption(options, "c1", "kataleia  dragonfly")?.teacherName).toBe("Kataleia Dragonfly");
    expect(findOption(options, "c1", "Evelina")?.teacherName).toBe("Evelina");
  });

  it("never sends it to another teacher, and chooses nothing without a class", () => {
    expect(findOption(options, "c1", "Petra")).toBeNull();
    expect(findOption(options, null, "Evelina")).toBeNull();
  });

  it("the form passes the choice to the picker, which applies it once", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    const picker = read("src/components/booking/PrivateClassPicker.tsx");
    expect(form).toMatch(/const preselectClass = privateKind \? searchParams\.get\("class"\)\?\.trim\(\) \|\| "" : "";/);
    expect(form).toMatch(/<PrivateClassPicker value=\{classChoice\} onChange=\{setClassChoice\} preselect=\{preselect\} \/>/);
    expect(picker).toMatch(/if \(preselected\.current \|\| !options \|\| !preselect\) return;/);
    expect(picker).toMatch(/const o = findOption\(options, preselect\.classId, preselect\.teacherName\);/);
  });
});

describe("the portfolio", () => {
  const src = read("src/components/TeacherPortfolios.tsx");
  const dialog = read("src/components/PrivateClassDialog.tsx");

  it("offers a private class on each of a teacher's classes — not on classes nobody teaches", () => {
    expect(src).toMatch(/\{isTeacher && canBookPrivately\(\(cls as any\)\.category\) && \(/);
    expect(src).toMatch(/setPrivatePick\(\{ classId: cls\.id, classTitle: cls\.title, teacherName: p\.teacher \}\)/);
  });

  it("shows the studio's private prices, the same as the Private Sessions page", () => {
    expect(dialog).toMatch(/const pricing = privatePricing\(ps\);/);
    expect(dialog).toMatch(/formatCRCWithUsd\(privatePriceUsd\(n, pricing\) \* USD_RATE\)/);
    expect(dialog).toMatch(/Nothing is paid now\./);
  });
});
