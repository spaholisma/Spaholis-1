import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  emailShell, emailDocument, detailsTable, detailsRow, emailButton, emailHead,
} from "../../supabase/functions/_shared/email-layout";

// Two promises to keep: the site is not cut off on a phone, and neither is the
// mail. The mail half is the one that was actually broken — every message went
// out without a viewport line, so phones laid it out at 980px and then shrank
// the whole thing to fit, which is why it arrived unreadably small.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("the email shell", () => {
  const html = emailShell("Your Reservation is Confirmed", "<p>Hello</p>");

  it("tells the phone to use its own width", () => {
    expect(html).toMatch(/<meta name="viewport" content="width=device-width,initial-scale=1">/);
  });

  it("carries the rules that give a phone its margins back", () => {
    expect(html).toMatch(/@media only screen and \(max-width:480px\)/);
    expect(html).toMatch(/\.wrap\{padding:10px!important\}/);
    expect(html).toMatch(/\.pad\{padding:20px 18px!important\}/);
  });

  it("lets long words break instead of pushing the layout sideways", () => {
    expect(html).toMatch(/word-break:break-word/);
    expect(html).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps images inside the screen", () => {
    expect(html).toMatch(/img\{max-width:100%!important;height:auto!important\}/);
  });

  it("is still the same 600px card on a laptop", () => {
    expect(html).toMatch(/max-width:600px/);
    // Nothing may pin a width in pixels: that is what stops it from shrinking.
    expect(html).not.toMatch(/(?<!max-)width:\s*\d{3,}px/);
  });

  it("says it is a light-coloured message, so dark mode does not invert it badly", () => {
    expect(html).toMatch(/<meta name="color-scheme" content="light">/);
    expect(html).toMatch(/-webkit-text-size-adjust:100%/);
  });

  it("lets a cancellation wear its own colour", () => {
    expect(emailShell("Booking Cancelled", "x", { headerBackground: "#7a2e2e" })).toMatch(/background:#7a2e2e/);
    expect(emailShell("Confirmed", "x")).toMatch(/background:#2F2F2F/);
  });

  it("escapes what goes in the title", () => {
    expect(emailHead('Bob "The" <Builder>')).toContain("Bob &quot;The&quot; &lt;Builder&gt;");
  });
});

describe("detail tables", () => {
  it("marks up label and value so a phone can stack them", () => {
    const row = detailsRow("Service", "Deep Tissue Massage");
    expect(row).toMatch(/class="k"/);
    expect(row).toMatch(/class="v"/);
    const table = detailsTable([row]);
    expect(table).toMatch(/<table class="t"/);
  });

  it("the stacking rule turns each row into its own card", () => {
    const html = emailShell("x", detailsTable([detailsRow("a", "b")]));
    expect(html).toMatch(/\.t tr\{display:block!important/);
    expect(html).toMatch(/\.t td\{display:block!important;width:auto!important/);
  });
});

describe("buttons in email", () => {
  const btn = emailButton("https://wa.me/50600000000", "Message us on WhatsApp", { background: "#25D366" });

  it("is big enough to hit with a thumb", () => {
    expect(btn).toMatch(/padding:12px 20px/);
    expect(btn).toMatch(/font-size:15px/);
  });

  it("goes full width on a phone", () => {
    expect(btn).toMatch(/class="btn"/);
    expect(emailShell("x", btn)).toMatch(/\.btn\{display:block!important;text-align:center!important\}/);
  });

  it("escapes the ampersands in a link, as email HTML requires", () => {
    expect(emailButton("mailto:a@b.com?subject=x&body=y", "Cancel")).toContain("&amp;body=y");
  });
});

describe("every email we send goes through it", () => {
  const dir = resolve(root, "supabase/functions");
  const senders = readdirSync(dir).filter((name) => {
    const f = resolve(dir, name, "index.ts");
    return existsSync(f) && readFileSync(f, "utf8").includes("api.resend.com");
  });

  it("finds the functions that send mail", () => {
    expect(senders.length).toBeGreaterThan(0);
  });

  for (const name of senders) {
    it(`${name} builds its HTML with the shared layout`, () => {
      const src = read(`supabase/functions/${name}/index.ts`);
      expect(src).toMatch(/from "\.\.\/_shared\/email-layout\.ts"/);
      // The old bare head is what caused the 980px layout; it must not come back.
      expect(src).not.toMatch(/<head><meta charset="utf-8"><\/head>/);
      expect(src).not.toMatch(/<!doctype html><html><body/i);
    });
  }
});

describe("the site on a phone", () => {
  it("does not hold text below 11px on public pages", () => {
    const offenders: string[] = [];
    const walk = (rel: string) => {
      for (const entry of readdirSync(resolve(root, rel), { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "admin" || entry.name === "teacher") continue;   // staff screens, not guests
          walk(child);
        } else if (entry.name.endsWith(".tsx")) {
          const src = read(child);
          // The numbered dot in the body-zone picker is a digit in a 20px
          // circle, not something anyone reads.
          if (child.includes("BodyZoneSelector")) continue;
          if (/text-\[10px\]|text-\[9px\]|text-\[8px\]/.test(src)) offenders.push(child);
        }
      }
    };
    walk("src/components");
    walk("src/pages");
    expect(offenders).toEqual([]);
  });

  it("stops iPhone Safari from inflating text sideways", () => {
    expect(read("src/index.css")).toMatch(/-webkit-text-size-adjust:\s*100%/);
  });

  it("keeps the floating WhatsApp button clear of the home indicator", () => {
    expect(read("src/components/WhatsAppButton.tsx")).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("lets long call-to-action labels wrap instead of running off the screen", () => {
    // Both of these were one line of text wide enough to leave the screen.
    const kinesiology = read("src/pages/Kinesiology.tsx");
    const meetButton = kinesiology.slice(kinesiology.indexOf("c.meetLink") - 400, kinesiology.indexOf("c.meetLink"));
    expect(meetButton).toMatch(/whitespace-normal/);

    const wellness = read("src/pages/WellnessPrograms.tsx");
    const ctaBlock = wellness.slice(wellness.indexOf("c.ctaPrimary") - 500, wellness.indexOf("c.ctaWhatsapp"));
    expect(ctaBlock.match(/whitespace-normal/g)?.length).toBe(2);
  });
});

describe("a loose block of HTML still gets the head", () => {
  it("wraps it in a proper document", () => {
    const doc = emailDocument("<p>hi</p>", "Your Holis purchase");
    expect(doc).toMatch(/<meta name="viewport"/);
    expect(doc).toContain("<p>hi</p>");
    expect(doc).toContain("<title>Your Holis purchase</title>");
  });
});
