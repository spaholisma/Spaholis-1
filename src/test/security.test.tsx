import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useHoneypot } from "@/components/Honeypot";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("nobody can send email in Holis' name", () => {
  it("send-transactional-email only answers the server (the public key is not enough)", () => {
    const fn = read("supabase/functions/send-transactional-email/index.ts");
    const guard = fn.indexOf("if (role !== 'service_role')");
    expect(guard).toBeGreaterThan(0);
    // Checked before anything is read, rendered or queued.
    expect(guard).toBeLessThan(fn.indexOf("await req.json()"));
    expect(guard).toBeLessThan(fn.indexOf("enqueue_email"));
    expect(fn).toMatch(/replace\(\/-\/g, '\+'\)\.replace\(\/_\/g, '\/'\)/); // base64url-safe
  });
});

describe("browser protections on every page", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const headers = Object.fromEntries(
    vercel.headers.find((h: any) => h.source === "/(.*)").headers.map((h: any) => [h.key, h.value]),
  );

  it("the site can't be framed by another site; the Admin preview (same site) still can", () => {
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
  });

  it("no script rules that could block PayPal, maps or fonts — only safe defaults", () => {
    expect(headers["Content-Security-Policy"]).not.toMatch(/script-src|default-src/);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), usb=()");
  });
});

describe("spam-bot trap on the enquiry forms", () => {
  function mount() {
    let hp!: ReturnType<typeof useHoneypot>;
    const Probe = () => {
      hp = useHoneypot();
      return <form>{hp.field}</form>;
    };
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<Probe />));
    return { el, hp: () => hp };
  }

  it("is invisible to people: off-screen, not reachable with Tab, hidden from screen readers", () => {
    const { el } = mount();
    const input = el.querySelector("input")!;
    expect(input.tabIndex).toBe(-1);
    expect(input.closest("[aria-hidden='true']")).not.toBeNull();
    expect((input.closest("div") as HTMLElement).style.left).toBe("-10000px");
    expect(input.autocomplete).toBe("off");
  });

  it("a person leaves it empty; a bot that fills it is caught", () => {
    const { el, hp } = mount();
    expect(hp().isBot()).toBe(false);
    el.querySelector("input")!.value = "http://spam.example";
    expect(hp().isBot()).toBe(true);
  });

  it("each enquiry form checks it before saving anything or emailing the team", () => {
    const forms: [string, string][] = [
      ["src/components/booking/ConsultationForm.tsx", 'from("bookings").insert'],
      ["src/pages/RetreatDetail.tsx", 'from("retreat_inquiries" as any).insert'],
      ["src/pages/StudioRental.tsx", 'from("bookings").insert'],
      ["src/pages/CustomRetreat.tsx", 'from("custom_retreat_inquiries").insert'],
      ["src/pages/Educational.tsx", 'from("bookings").insert'],
    ];
    for (const [file, insert] of forms) {
      const src = read(file);
      expect(src, file).toMatch(/\{hp\.field\}/);
      expect(src.indexOf("hp.isBot()"), file).toBeGreaterThan(0);
      expect(src.indexOf("hp.isBot()"), file).toBeLessThan(src.indexOf(insert));
    }
  });

  it("bookings and payments are not touched", () => {
    for (const file of ["src/pages/Booking.tsx", "src/pages/ClassBooking.tsx", "src/pages/ExperienceBooking.tsx", "src/pages/GiftCards.tsx"]) {
      expect(read(file), file).not.toMatch(/useHoneypot/);
    }
  });
});
