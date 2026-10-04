import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scrollToSection } from "@/lib/scrollToTop";
import { content } from "@/data/content";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("About menu: Our Story, Evelina Bolognini, Our Team", () => {
  // jsdom has no scrolling; give it the method so it can be watched.
  beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  });
  afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

  it("goes to the section once it is on the page — even if it shows up late", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      calls.push(this.id);
    });
    scrollToSection("team");
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([]); // not there yet
    const el = document.createElement("section");
    el.id = "team";
    document.body.appendChild(el);
    vi.advanceTimersByTime(800);
    expect(calls[0]).toBe("team");
    spy.mockRestore();
  });

  it("can be cancelled (leaving the page before it is found)", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const stop = scrollToSection("story");
    stop();
    const el = document.createElement("section");
    el.id = "story";
    document.body.appendChild(el);
    vi.advanceTimersByTime(3000);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("every click counts — the site follows the navigation, not only the first load", () => {
    const top = read("src/components/ScrollToTop.tsx");
    expect(top).toMatch(/return scrollToSection\(id, \{ smooth: !reduceMotion \}\);\n  \}, \[hash, key, reduceMotion\]\);/);
    expect(read("src/pages/About.tsx")).not.toMatch(/\}, \[siteContent\]\);/);
    const about = read("src/pages/About.tsx");
    for (const id of ["story", "founder", "team"]) expect(about).toMatch(new RegExp(`<section id="${id}"`));
  });
});

describe("the welcome team", () => {
  it("is Mario, Maryeling and Alejandra", () => {
    expect((content as any).about.management.map((m: any) => m.name)).toEqual(["Mario", "Maryeling", "Alejandra"]);
  });
});

describe("the FAQ page", () => {
  const faq = read("src/pages/Faqs.tsx");

  it("uses the full width when there is only one topic (no empty side column)", () => {
    expect(faq).toMatch(/grouped\.length > 1 \? "lg:grid-cols-\[220px_1fr\]" : "max-w-3xl mx-auto"/);
  });

  it("opens one answer at a time, accessibly", () => {
    expect(faq).toMatch(/aria-expanded=\{open\}/);
    expect(faq).toMatch(/aria-controls=\{panelId\}/);
  });

  it("ends with a way to ask a person (WhatsApp without wa.me, and email)", () => {
    expect(faq).toMatch(/https:\/\/api\.whatsapp\.com\/send\?phone=\$\{HOLIS_WHATSAPP_NUMBER\}/);
    expect(faq).toMatch(/mailto:\$\{HOLIS_EMAIL\}/);
  });
});
