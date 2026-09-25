import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateClassIntake, privateRequestPath } from "@/lib/privateClassRequest";
import {
  fromPrice, kindsOffered, maxGroup, offeringPrice, offeringsOf, type PrivateOffering,
} from "@/lib/privateOfferings";

// Private classes belong to the teacher: she lists hers in her Teacher Panel,
// each with her own prices. Her class pages show all of them in a menu, and the
// request page shows her price once her class is chosen.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const offering = (over: Partial<PrivateOffering> = {}): PrivateOffering => ({
  id: "o1", teacher_id: "t1", teacher_name: "Ashley", teacher_photo: null, class_id: "c1",
  title: "Private Aerial Yoga", description: null, duration_minutes: 60,
  price_one: 90, price_two: 120, price_group: 180, price_extra: 30, ...over,
});

describe("her prices", () => {
  it("one person, two people, a group of up to four, and each extra person", () => {
    const o = offering();
    expect(offeringPrice(o, "oneOnOne", 1)).toBe(90);
    expect(offeringPrice(o, "couples", 2)).toBe(120);
    expect(offeringPrice(o, "group", 4)).toBe(180);
    expect(offeringPrice(o, "group", 6)).toBe(240);
  });

  it("a price left empty is a kind she does not offer; no extra price means groups of four at most", () => {
    const aerial = offering({ price_group: null, price_extra: null });
    expect(kindsOffered(aerial)).toEqual(["oneOnOne", "couples"]);
    expect(offeringPrice(aerial, "group", 4)).toBeNull();
    const small = offering({ price_extra: null });
    expect(maxGroup(small)).toBe(4);
    expect(offeringPrice(small, "group", 5)).toBeNull();
    expect(maxGroup(offering())).toBe(20);
  });

  it("the lowest one reads as “from”", () => {
    expect(fromPrice(offering())).toBe(90);
    expect(fromPrice(offering({ price_one: null }))).toBe(120);
  });

  it("the class page lists all of hers, the one for that class first", () => {
    const all = [
      offering({ id: "a", class_id: "other" }),
      offering({ id: "b", class_id: "c1" }),
      offering({ id: "x", teacher_name: "Petra" }),
    ];
    expect(offeringsOf(all, " ashley ", "c1").map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("the request", () => {
  it("the link carries her private class, the kind and the people", () => {
    const q = new URLSearchParams(privateRequestPath({
      kind: "group", kindTitle: "Private Group Class", people: 6, offeringId: "o1", classId: "c1", teacherName: "Ashley",
    }).split("?")[1]);
    expect(q.get("offering")).toBe("o1");
    expect(q.get("private")).toBe("group");
    expect(q.get("people")).toBe("6");
    expect(q.get("teacher")).toBe("Ashley");
  });

  it("keeps which of her classes was picked — and nothing about money", () => {
    const pc = privateClassIntake({ kind: "oneOnOne", kindTitle: "One-on-One", people: 1, offering: offering(), preferred: "" }).private_class;
    expect(pc).toMatchObject({ offering_id: "o1", class_id: "c1", class_title: "Private Aerial Yoga", teacher_name: "Ashley" });
    expect(JSON.stringify(pc)).not.toMatch(/price/);
  });

  it("the request page shows her price once her class is chosen, otherwise says it depends", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toMatch(/const privatePrice = privateKind && classChoice \? offeringPrice\(classChoice, privateKind, people\) : null;/);
    expect(form).toMatch(/Price depends on the class and teacher/);
    const picker = read("src/components/booking/PrivateClassPicker.tsx");
    // Only the ones she offers for this kind and this many people.
    expect(picker).toMatch(/\(all \?\? \[\]\)\.filter\(\(o\) => priceOf\(o\) != null\)/);
    expect(picker).toMatch(/options\.find\(\(x\) => x\.id === preselect\.offeringId\)/);
  });
});

describe("the pages", () => {
  it("the class page shows her private classes in her card", () => {
    const page = read("src/pages/ClassDetail.tsx");
    expect(page).toMatch(/offeringsOf\(allPrivate, teacherName, cls\?\.id\)/);
    expect(page).toMatch(/<TeacherPrivateSection\s+teacherName=\{teacherName\}\s+offerings=\{privateOfferings\}/);
    const section = read("src/components/TeacherPrivateSection.tsx");
    expect(section).toMatch(/aria-label=\{`Private classes with \$\{first\}`\}/);
  });

  it("the Classes page has one entry per teacher, not a button per class", () => {
    const src = read("src/components/TeacherPortfolios.tsx");
    expect(src).toMatch(/setPrivatePick\(\{ teacherName: p\.teacher, offerings: mine \}\)/);
    expect(src).not.toMatch(/canBookPrivately/);
  });

  it("the Private Sessions page no longer lists fixed prices, except for GYROTONIC", () => {
    const page = read("src/pages/PrivateClasses.tsx");
    expect(page).not.toMatch(/Pricing Guide/);
    expect(page).toMatch(/The price depends on the class and teacher you choose/);
    expect(page).toMatch(/cls\.i18nKey === "gyrotonic" \?/);
  });
});

describe("the database and the emails", () => {
  const sql = read("supabase/migrations/20260930150000_teacher_private_offerings.sql");
  const fn = read("supabase/functions/send-private-class-request/index.ts");

  it("she manages only her own; guests read only active ones through a function", () => {
    expect(sql).toMatch(/using \(teacher_id = public\.current_teacher_id\(\)\)\s+with check \(teacher_id = public\.current_teacher_id\(\)\)/);
    expect(sql).toMatch(/where o\.active and t\.active/);
    expect(sql).toMatch(/grant execute on function public\.public_private_offerings\(\) to anon, authenticated;/);
    expect(sql).not.toMatch(/grant [^;]* on public\.teacher_private_offerings to anon/);
  });

  it("the price is worked out on the server, and a class needs at least one", () => {
    expect(sql).toMatch(/else o\.price_group \+ \(_people - 4\) \* o\.price_extra/);
    expect(sql).toMatch(/check \(price_one is not null or price_two is not null or price_group is not null\)/);
    expect(fn).toMatch(/admin\.rpc\("private_offering_price"/);
    expect(fn).toMatch(/row\("Price"/);
  });
});
