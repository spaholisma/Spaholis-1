import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A class shows on the website only when it is ACTIVE *and* has dates on the
// schedule: every public listing is built from class_schedule, not from the
// classes table. That rule is easy to trip over in the Admin — switch a class
// on, forget the dates, and it silently stays invisible. These checks keep the
// Admin honest about it.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("what the website lists", () => {
  it("builds the public pages from the schedule, not from the class list", () => {
    for (const p of ["src/pages/Classes.tsx", "src/pages/ClassesCalendar.tsx", "src/components/FeaturedWorkshop.tsx"]) {
      const src = read(p);
      expect(/useUpcomingEvents|useWeekEvents/.test(src)).toBe(true);
      // useClasses() reads the catalogue and ignores the schedule, so no
      // public page may call it — only the Admin does.
      expect(/useClasses\s*\(/.test(src)).toBe(false);
    }
  });

  it("hides sessions that are cancelled or already past", () => {
    const src = read("src/hooks/useClasses.ts");
    expect(src).toMatch(/is_cancelled/);
    expect(src).toMatch(/gte\("start_time"/);
  });
});

describe("Admin > Classes", () => {
  const src = read("src/components/admin/AdminEventsManager.tsx");

  it("counts the sessions ahead for each class", () => {
    expect(src).toMatch(/from\("class_schedule"\)[\s\S]{0,200}gte\("start_time"/);
    expect(src).toMatch(/eq\("is_cancelled", false\)/);
    expect(src).toMatch(/setUpcoming/);
  });

  it("flags an active class that has no dates ahead", () => {
    expect(src).toMatch(/c\.is_active && \(upcoming\[c\.id\] \?\? 0\) === 0/);
    expect(src).toMatch(/Not on the schedule/);
    expect(src).toMatch(/do not appear on the website|does[\s\S]{0,40}not appear on the website/);
  });
});

describe("cancelling a session", () => {
  const src = read("src/components/admin/AdminClassCalendarWithAttendees.tsx");

  it("says how many people are signed up before cancelling", () => {
    const fn = src.slice(src.indexOf("const toggleCancel"), src.indexOf("const toggleCancel") + 1400);
    expect(fn).toMatch(/count: "exact"/);
    expect(fn).toMatch(/neq\("status", "cancelled"\)/);
    expect(fn).toMatch(/signed up for this session/);
    // Only counts when it is being cancelled, never when reactivated.
    expect(fn).toMatch(/if \(next\) \{/);
  });
});
