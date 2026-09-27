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
