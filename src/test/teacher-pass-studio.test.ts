import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { teachersForPass, type HerPass, type PublicTeacher, type StudioPass } from "@/components/TeacherPassStudio";

// Every pass except the Drop-in is sold by a teacher, at her own price:
// pick the pass, then her. Only teachers who sell that pass are offered.
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

const pass = (name: string): StudioPass => ({
  id: name, name, description: null, type: "class_pass", price: 100, credits: 5, duration_days: 30, is_unlimited: false,
});
const her = (teacher: string, name: string, price: number): HerPass => ({
  membership_id: `${teacher}-${name}`, teacher_name: teacher, membership_name: name, price,
  classes_included: 5, valid_days: null, description: null, payment_link: null, payment_note: null,
  teacher_payment_instructions: null,
});
const t = (display_name: string): PublicTeacher => ({ id: display_name, display_name, photo_url: null, bio: null });

describe("who sells a pass", () => {
  const teachers = [t("Zhijian Chen"), t("Evelina")];
  const herPasses = [her("Zhijian Chen", "5-Class Pass", 101), her("evelina ", "10-class pass", 160)];

  it("only the teachers with their own version of it, matched by name", () => {
    expect(teachersForPass(pass("5-Class Pass"), herPasses, teachers).map((x) => x.teacher.display_name))
      .toEqual(["Zhijian Chen"]);
    expect(teachersForPass(pass("10-Class Pass"), herPasses, teachers).map((x) => x.teacher.display_name))
      .toEqual(["Evelina"]);
    expect(teachersForPass(pass("Monthly Unlimited"), herPasses, teachers)).toEqual([]);
  });

  it("with her price, not the studio's", () => {
    expect(teachersForPass(pass("10-Class Pass"), herPasses, teachers)[0].herPass.price).toBe(160);
  });
});

describe("the memberships page", () => {
  it("keeps the Drop-in as it was and sells the rest through the teachers", () => {
    const page = read("src/pages/Memberships.tsx");
    expect(page).toMatch(/<TeacherPassStudio dropIn=\{<PassChooser compact only=\{\["drop_in"\]\} \/>\} \/>/);
    const studio = read("src/components/TeacherPassStudio.tsx");
    expect(studio).toMatch(/\.neq\("type", "drop_in"\)/);
    expect(studio).toMatch(/Choose your teacher/);
    expect(studio).toMatch(/About this pass/);
  });
});
