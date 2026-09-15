import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSamePage } from "@/lib/scrollToTop";

// Every page starts at the top, on refresh and when changing page.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("starting at the top", () => {
  it("treats another page as a new page", () => {
    expect(isSamePage("/", "/about")).toBe(false);
    expect(isSamePage("/classes", "/classes/schedule")).toBe(false);
    expect(isSamePage("/retreats", "/retreats/beach-yoga-retreat")).toBe(false);
    expect(isSamePage("/treatments-therapies/massage-therapy", "/book")).toBe(false);
  });

  it("keeps the position for a language switch or a tab on the same page", () => {
    expect(isSamePage("/about", "/es/about")).toBe(true);
    expect(isSamePage("/es", "/")).toBe(true);
    expect(isSamePage("/treatments-therapies/massage-therapy", "/treatments-therapies/organic-facials")).toBe(true);
    expect(isSamePage("/treatments-therapies", "/es/treatments-therapies/spa-packages")).toBe(true);
  });

  it("is mounted once for the whole site and stops the browser restoring the old position", () => {
    expect(read("src/App.tsx")).toContain("<ScrollToTop />");
    const comp = read("src/components/ScrollToTop.tsx");
    expect(comp).toContain('window.history.scrollRestoration = "manual"');
    expect(comp).toContain("if (hash) return;");
  });
});
