import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLASS_REQUESTS_KEY, classRequestHref } from "@/lib/classRequests";

// 2026-11: a special event (e.g. Wellness Sunday) can be offered "on request":
// it shows on the Classes page without a date, with a Request button that opens
// the request form. Set in Admin → Classes → Edit Event → Special event options;
// kept in site_content "class_requests" → { ids }, so no new column.

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("special events on request", () => {
  it("the Request button opens the request form with the event named", () => {
    expect(classRequestHref("Wellness Sunday")).toBe(
      "/book?service=consultation&topic=Special%20Event%3A%20Wellness%20Sunday",
    );
    expect(CLASS_REQUESTS_KEY).toBe("class_requests");
  });

  it("the request form speaks of the event, not of a therapist appointment", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toContain("const isEventRequest = !privateKind && /^special event:/i.test(topic);");
    expect(form).toContain('isEventRequest ? t("consultation.eventRequestTitle"');
    expect(form).toContain('isEventRequest ? t("consultation.eventSubmit"');
  });

  it("the Edit Event form has the option and saves it", () => {
    const form = read("src/components/admin/AdminEventsManager.tsx");
    expect(form).toMatch(/On request \(no date needed\)/);
    expect(form).toMatch(/setClassOnRequest\(savedId, onRequest\)/);
    expect(form).toMatch(/insert\(payload as any\)\.select\("id"\)\.single\(\)/);
    // On-request events are not reported as missing from the website.
    expect(form).toMatch(/!requestIds\.includes\(c\.id\)\);/);
  });

  it("the Classes page lists them with the special events, unless they already have a date", () => {
    const page = read("src/pages/Classes.tsx");
    expect(page).toMatch(/requestClasses\.filter\(\(c\) => !scheduledIds\.has\(c\.id\)\)/);
    expect(page).toMatch(/<RequestEventCard key=\{c\.id\} cls=\{c\} \/>/);
    const card = read("src/components/EventCard.tsx");
    expect(card).toMatch(/<Link to=\{classRequestHref\(cls\.title\)\}>/);
    const hook = read("src/hooks/useClasses.ts");
    expect(hook).toMatch(/export function useRequestEvents\(\)/);
    expect(hook).toMatch(/\.in\("id", ids\)\s*\n\s*\.eq\("is_active", true\)/);
  });
});
