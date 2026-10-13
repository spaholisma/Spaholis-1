import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";

vi.mock("@/components/ClassEligibilityBadge", () => ({ ClassEligibilityBadge: () => null }));

import { todaySummary } from "@/components/TodayClassesCta";
import { MobileDayAgenda, addDayKey, agendaDays, classesByDay } from "@/components/MobileDayAgenda";
import { portfolioFor } from "@/components/InstructorPortfolios";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

// 2026-10-13 15:00 UTC = 9:00 AM in Costa Rica.
const NOW = new Date("2026-10-13T15:00:00Z");
const row = (id: string, iso: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, class_id: `c-${title}`, start_time: iso, spots_remaining: 8, instructor: "Evelina", is_cancelled: false,
  classes: { id: `c-${title}`, title, instructor: "Evelina", duration_minutes: 60, category: "Studio Classes" },
  ...extra,
}) as any;

describe("See today's classes", () => {
  it("counts what is left today in studio time, and opens on the next day when nothing is", () => {
    const today = [row("a", "2026-10-13T23:00:00Z", "Cardio"), row("b", "2026-10-14T01:00:00Z", "Late")]; // 5 PM, 7 PM CR
    const s = todaySummary([...today, row("c", "2026-10-14T14:00:00Z", "Power Flow")], NOW);
    expect(s.today).toBe("2026-10-13");
    expect(s.count).toBe(2); // 7 PM CR on the 13th is the 14th in UTC — still today here
    expect(s.next?.id).toBe("a");
    expect(s.openDay).toBe("2026-10-13");
    const none = todaySummary([row("c", "2026-10-14T14:00:00Z", "Power Flow")], NOW);
    expect(none.count).toBe(0);
    expect(none.openDay).toBe("2026-10-14");
    // A class that already started is not "left today".
    expect(todaySummary([row("x", "2026-10-13T14:00:00Z", "Early")], NOW).count).toBe(0);
  });

  it("comes first on the Classes page, before the private-class link and Gyrotonic", () => {
    const page = read("src/pages/Classes.tsx");
    const cta = page.indexOf("<TodayClassesCta");
    expect(cta).toBeGreaterThan(page.indexOf("cls.title}</h1>"));
    expect(cta).toBeLessThan(page.indexOf("{cls.privateLink}"));
    expect(cta).toBeLessThan(page.indexOf("Discover GYROTONIC® Expansion System"));
    // The old text link under the title is gone (the teachers section keeps its own).
    expect(page.match(/\{cls\.calendarLink\}/g) ?? []).toHaveLength(1);
    expect(page.indexOf("{cls.calendarLink}")).toBeGreaterThan(page.indexOf("{cls.privateLink}"));
  });
});

describe("the class calendar on a phone", () => {
  it("days on the studio calendar, today first", () => {
    expect(addDayKey("2026-10-31", 1)).toBe("2026-11-01");
    const days = agendaDays(NOW, 5);
    expect(days).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
    const map = classesByDay([row("b", "2026-10-14T01:00:00Z", "Late"), row("x", "2026-10-13T14:00:00Z", "Early")], NOW.getTime());
    expect(map.get("2026-10-13")?.map((e) => e.id)).toEqual(["b"]); // started ones are gone
  });

  it("shows one day, changes day on tap and on a swipe, and points to the next class", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const events = [
      row("a", "2026-10-13T23:00:00Z", "Cardio Vascular Breathwork"),
      row("c", "2026-10-15T14:00:00Z", "Aerial Yoga"),
    ];
    document.body.innerHTML = "";
    const el = document.createElement("div"); document.body.appendChild(el);
    act(() => createRoot(el).render(
      <MemoryRouter><MobileDayAgenda events={events} closures={[{ id: "z", closed_date: "2026-10-17", reason: "We are in vacation" }]} /></MemoryRouter>,
    ));
    const body = document.body;
    const selected = () => body.querySelector('[role=tab][aria-selected=true]')!.getAttribute("data-day");
    expect(selected()).toBe("2026-10-13");
    expect(body.textContent).toMatch(/Today/);
    expect(body.textContent).toMatch(/Cardio Vascular Breathwork/);
    expect(body.textContent).not.toMatch(/Aerial Yoga/);

    // Wednesday has nothing: it says so and offers Thursday's class.
    act(() => { (body.querySelector('[data-day="2026-10-14"]') as HTMLButtonElement).click(); });
    expect(body.textContent).toMatch(/No classes on this day/);
    const nextBtn = Array.from(body.querySelectorAll("button")).find((b) => b.textContent?.includes("Next class"))!;
    expect(nextBtn.textContent).toMatch(/Aerial Yoga/);
    act(() => { nextBtn.click(); });
    expect(selected()).toBe("2026-10-15");

    // A swipe to the left is the next day; the studio is closed then.
    const area = body.querySelector("[role=tablist]")!.nextElementSibling as HTMLElement;
    const touch = (x: number) => ({ clientX: x, clientY: 300 });
    act(() => {
      area.dispatchEvent(Object.assign(new Event("touchstart", { bubbles: true }), { touches: [touch(250)] }));
      area.dispatchEvent(Object.assign(new Event("touchend", { bubbles: true }), { changedTouches: [touch(120)] }));
    });
    expect(selected()).toBe("2026-10-16");
    act(() => { (body.querySelector('[data-day="2026-10-17"]') as HTMLButtonElement).click(); });
    expect(body.textContent).toMatch(/The studio is closed/);
    expect(body.textContent).toMatch(/We are in vacation/);

    // And back to today.
    act(() => { Array.from(body.querySelectorAll("button")).find((b) => b.textContent === "Today")!.click(); });
    expect(selected()).toBe("2026-10-13");
    vi.useRealTimers();
  });

  it("only the phone changes — the laptop keeps the week grid", () => {
    const cal = read("src/components/WeeklyClassCalendar.tsx");
    expect(cal).toMatch(/<div className="hidden md:block">\n\s+\{\/\* Day Headers \*\/\}/);
    expect(cal).toMatch(/<div className="hidden md:flex items-center justify-between mb-6">/);
    expect(cal).toMatch(/<div className="md:hidden">\n\s+<MobileDayAgenda events=\{events\} closures=\{closures\} initialDay=\{initialDay\} \/>/);
    expect(read("src/pages/ClassesCalendar.tsx")).toMatch(/const initialDay = params\.get\("day"\);/);
  });
});

describe("the instructors on About Us", () => {
  const p = (teacher: string, slug: string) => ({ teacher, slug, classes: [] }) as any;
  it("each card opens her portfolio — by name or by first name", () => {
    const all = [p("Kataleia", "kataleia"), p("Melanie Moss", "melanie-moss"), p("Evelina", "evelina")];
    expect(portfolioFor({ name: "Kataleia" }, all)?.slug).toBe("kataleia");
    expect(portfolioFor({ name: "Melanie" }, all)?.slug).toBe("melanie-moss");
    expect(portfolioFor({ name: "Mike" }, all)).toBeNull();
    expect(read("src/pages/About.tsx")).toMatch(/<InstructorPortfolios instructors=\{instructors\} \/>/);
    expect(read("src/components/InstructorPortfolios.tsx")).toMatch(/t\("about\.meetTeacher", \{ name: first, defaultValue: "Meet \{\{name\}\}" \}\)/);
  });
});
