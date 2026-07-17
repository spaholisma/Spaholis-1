/**
 * Wizard step-order contract for the /book flow.
 *
 * The customer-visible order for standard paid treatments must be:
 *   Service → Date/Time → Your Details → Intake → Summary → Checkout → Confirmation
 *
 * Facials skip the health intake but still get the Summary step.
 * Non-paid / retreat / class flows keep their existing (unchanged) shorter
 * step lists — this test locks all of that so future edits can't silently
 * reintroduce the old order (which asked for the customer's name twice and
 * showed the intake form before contact info, hurting conversion).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../pages/Booking.tsx"),
  "utf8",
);

describe("booking wizard step order", () => {
  it("standard paid treatment: Service → DateTime → Details → Intake → Summary → Checkout → Confirmation", () => {
    // The default (no service) path is the standard paid template.
    const defaultReturn = SRC.match(
      /if \(!service\) return \[([^\]]+)\];/,
    );
    expect(defaultReturn).toBeTruthy();
    const order = defaultReturn![1].replace(/\s+/g, "");
    expect(order).toBe("S,DT,YD,IF,SUM,CHK,CONF");
  });

  it("facial: Service → DateTime → Details → Summary → Checkout → Confirmation (no intake)", () => {
    const facialReturn = SRC.match(
      /isFacialService\(service\)\) return \[([^\]]+)\];/,
    );
    expect(facialReturn).toBeTruthy();
    const order = facialReturn![1].replace(/\s+/g, "");
    expect(order).toBe("S,DT,YD,SUM,CHK,CONF");
    // Explicitly: no intake step.
    expect(order).not.toContain("IF");
  });

  it("class flow is untouched (no intake, no summary)", () => {
    const classReturn = SRC.match(/if \(isClass\) return \[([^\]]+)\];/);
    expect(classReturn).toBeTruthy();
    const order = classReturn![1].replace(/\s+/g, "");
    expect(order).toBe("S,DT,YD,CONF");
  });

  it("retreat keeps the intake-before-details inquiry flow (quoted, no deposit)", () => {
    const m = SRC.match(/Wellness Retreats"\) return \[([^\]]+)\];/);
    expect(m).toBeTruthy();
    expect(m![1].replace(/\s+/g, "")).toBe("S,IF,YD,CONF");
  });

  it("program and experience take the same deposit as treatments", () => {
    // Programs keep intake-before-details and have no date step (scheduled with
    // the client afterwards), but both now end in Summary → Checkout.
    const program = SRC.match(/"program"\) return \[([^\]]+)\];/);
    expect(program).toBeTruthy();
    expect(program![1].replace(/\s+/g, "")).toBe("S,IF,YD,SUM,CHK,CONF");

    const experience = SRC.match(/"experience"\) return \[([^\]]+)\];/);
    expect(experience).toBeTruthy();
    expect(experience![1].replace(/\s+/g, "")).toBe("S,DT,YD,SUM,CHK,CONF");
  });

  it("the retreat inquiry shortcut never hijacks a deposit flow", () => {
    // Programs match `isRetreat` but now take a deposit. Without the
    // !needsPayment guard the details step would submit them as an inquiry and
    // they'd never reach checkout.
    expect(SRC).toMatch(
      /isRetreat\s*&&\s*!needsPayment\s*&&\s*step\s*===\s*detailsStepIdx/,
    );
  });

  it("Summary step key is registered in EN + ES locales", () => {
    const en = readFileSync(
      resolve(__dirname, "../i18n/locales/en.json"),
      "utf8",
    );
    const es = readFileSync(
      resolve(__dirname, "../i18n/locales/es.json"),
      "utf8",
    );
    expect(JSON.parse(en).booking.steps.summary).toBeTruthy();
    expect(JSON.parse(es).booking.steps.summary).toBeTruthy();
  });

  it("intake form no longer asks for guest_name in any flow (dedup contract)", () => {
    // Neither solo nor couples renders the intake guest_name input anymore.
    // The renderPersonForm helper takes only 3 args and does NOT accept a
    // showGuestName flag; any regression that re-adds it will fail here.
    expect(SRC).toMatch(
      /renderPersonForm\(intakeForm,\s*setIntakeForm,\s*"p1"\)/,
    );
    expect(SRC).toMatch(
      /renderPersonForm\(intakeForm2,\s*setIntakeForm2,\s*"p2"\)/,
    );
    // The guest_name <Input> block was removed entirely.
    expect(SRC).not.toMatch(/guestNamePlaceholder/);
  });

  it("createBooking payload injects formData.name as intake_form.guest_name", () => {
    // Solo path: {...intakeForm, guest_name: formData.name, ...}
    expect(SRC).toMatch(/guest_name:\s*formData\.name/);
  });

  it("paid flow confirms with a card-on-file authorization, not a CompraClick redirect", () => {
    // The Checkout step is now a card-authorization form: it creates the booking
    // and stores the card via save_card_authorization (no charge in advance).
    expect(SRC).toMatch(/save_card_authorization/);
    expect(SRC).toMatch(/handleCardAuthorize/);
    // The old static CompraClick redirect is gone.
    expect(SRC).not.toMatch(/getBacCompraClickLink/);
    expect(SRC).not.toMatch(/window\.location\.href\s*=\s*link/);
  });
});
