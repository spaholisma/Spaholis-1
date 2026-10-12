import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// The navbar is fixed and 4rem tall. On shorter phones (e.g. an iPhone 14 Pro
// in Safari) a hero with a fixed height pushed its text up under the navbar.
const root = resolve(__dirname, "../..");
const pagesDir = resolve(root, "src/pages");
const pages = readdirSync(pagesDir)
  .filter((f) => f.endsWith(".tsx") && !/^Admin/.test(f))
  .map((f) => ({ f, src: readFileSync(resolve(pagesDir, f), "utf8") }));

describe("heroes on any screen", () => {
  it("no hero has a fixed viewport height — they grow with their content", () => {
    for (const { f, src } of pages) {
      expect(src, f).not.toMatch(/className="relative h-\[\d+vh\]/);
    }
  });

  it("the heroes leave room for the navbar above their text", () => {
    const read = (p: string) => readFileSync(resolve(pagesDir, p), "utf8");
    expect(read("Index.tsx")).toMatch(/min-h-\[max\(600px,90vh\)\][\s\S]*?flex flex-1 items-center justify-center px-4 sm:px-6 lg:px-8 pt-24 pb-16/);
    for (const p of ["About.tsx", "SignatureTreatments.tsx", "WellnessPrograms.tsx"]) {
      expect(read(p), p).toMatch(/relative flex flex-col min-h-\[max\(\d+px,\d+vh\)\][\s\S]*?flex flex-1 flex-col justify-end w-full[^"]*pt-24/);
    }
    expect(read("Educational.tsx")).toMatch(/min-h-\[max\(400px,50vh\)\] flex items-center justify-center overflow-hidden pt-24/);
  });

  it("21:9 page banners with a title laid over them are at least 260px tall on phones", () => {
    // The page-top banner: <div className="relative pt-16"> then the 21:9 image.
    const re = /<div className="relative pt-16">\s*<div className="aspect-\[21\/9\][^"]*"/g;
    const banners = pages.flatMap(({ f, src }) => [...src.matchAll(re)].map((m) => ({ f, cls: m[0] })));
    expect(banners.map((b) => b.f).sort()).toEqual(
      ["Blog.tsx", "DayRetreats.tsx", "RetreatDetail.tsx", "Retreats.tsx", "Services.tsx", "StudioRental.tsx"],
    );
    for (const { f, cls } of banners) expect(cls, f).toMatch(/min-h-\[260px\]/);
  });
});

describe("pages that start right under the navbar", () => {
  it("the legal pages leave room above their title (py-16 matched the navbar exactly)", () => {
    for (const f of ["Terms.tsx", "Privacy.tsx", "Refund.tsx"]) {
      expect(readFileSync(resolve(pagesDir, f), "utf8"), f).toMatch(/<main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">/);
    }
  });
});

describe("the mobile menu", () => {
  it("fits the space left under the navbar, so its last links stay reachable", () => {
    const nav = readFileSync(resolve(root, "src/components/Navbar.tsx"), "utf8");
    expect(nav).toMatch(/max-h-\[calc\(100vh-4rem\)\] supports-\[height:100dvh\]:max-h-\[calc\(100dvh-4rem\)\] overflow-y-auto/);
    expect(nav).not.toMatch(/max-h-\[85vh\]/);
  });
});

describe("2026-10 screen review (phones 320-430px, laptops 1024-1440px)", () => {
  const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

  it("a blog post's long title makes the hero taller instead of climbing under the navbar", () => {
    const post = read("src/pages/BlogPost.tsx");
    expect(post).toMatch(/relative flex w-full flex-col justify-end overflow-hidden min-h-\[max\(340px,62\.5vw\)\] md:min-h-\[min\(560px,42\.86vw\)\]/);
    expect(post).not.toMatch(/absolute bottom-8 left-0 right-0/);
  });

  it("the homepage buttons fit a 320px phone (full width, allowed to wrap)", () => {
    const home = read("src/pages/Index.tsx");
    expect(home).toMatch(/const HERO_BTN = "w-full sm:w-auto h-auto min-h-14 py-3 px-6 sm:px-10 whitespace-normal text-center leading-snug";/);
    expect(home.match(/className=\{(cn\()?HERO_BTN/g)).toHaveLength(4);
    expect(home).toMatch(/className="w-full max-w-2xl text-center"/);
  });

  it("booking: the treatment name keeps its width, no '1 SESSIONS', no '0 min'", () => {
    const book = read("src/pages/Booking.tsx");
    expect(book).toMatch(/<div className="min-w-0 flex-1">\n\s+\{\/\* The name keeps its width/);
    expect(book).toMatch(/\{s\.sessions\} \{Number\(s\.sessions\) === 1 \? "session" : "sessions"\}/);
    expect(book).toMatch(/!\(s\.duration_minutes > 0\) \? ""/);
    expect(book).toMatch(/cat\.charAt\(0\)\.toUpperCase\(\) \+ cat\.slice\(1\)/);
    expect(read("src/components/ServiceCard.tsx")).toMatch(/\{durationLabel && \(/);
    expect(read("src/components/ServiceDetailModal.tsx")).toMatch(/\.\.\.\(service\.duration_minutes > 0 \? \[\{ icon: Clock/);
  });

  it("the class calendar shows long names in full; the treatment photo is shorter on phones", () => {
    expect(read("src/components/WeeklyClassCalendar.tsx")).toMatch(/leading-tight line-clamp-3" title=\{cls\.title \?\? undefined\}/);
    expect(read("src/pages/Services.tsx")).toMatch(/aspect-\[4\/3\] md:aspect-\[4\/5\] rounded-2xl/);
  });
});
