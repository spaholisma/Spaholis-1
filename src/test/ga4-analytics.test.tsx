import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import * as ga from "@/lib/analytics";
import { AnalyticsTracker, bookingLinkType, isUntrackedPath, isWhatsAppHref } from "@/components/AnalyticsTracker";
import { ConsentBanner } from "@/components/ConsentBanner";

// Google Analytics 4: one stream, nothing before consent, one page_view per
// page, no personal data, and a booking counted once — revenue only when paid.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything sent to gtag, as plain arrays: ["event", "page_view", {...}] */
const calls = () => (window.dataLayer ?? []).map((a: any) => Array.from(a as ArrayLike<unknown>));
const events = (name?: string) => calls().filter((c) => c[0] === "event" && (!name || c[1] === name));
const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length;

beforeEach(() => {
  ga.__resetAnalyticsForTests();
  ga.setAnalyticsEnvironment({ allowInDev: true });
  delete (window as any).gtag;
  delete (window as any).dataLayer;
  document.querySelectorAll("script").forEach((s) => s.remove());
  localStorage.clear();
  sessionStorage.clear();
});

describe("the stream", () => {
  it("is G-W4GMPQKK5N, and the old stream is not touched by the code", () => {
    expect(ga.GA4_MEASUREMENT_ID).toBe("G-W4GMPQKK5N");
    expect(read("src/lib/analytics.ts")).not.toMatch(/EZT4ZT0EYJ/);
  });
});

describe("consent", () => {
  it("nothing loads and nothing is sent before the visitor accepts", () => {
    expect(ga.startAnalytics()).toBe(false);
    expect(ga.trackPageView()).toBe(false);
    expect(ga.track("click_whatsapp")).toBe(false);
    expect(gaScripts()).toBe(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it("declining keeps it off", () => {
    ga.setConsent("denied");
    expect(ga.startAnalytics()).toBe(false);
    expect(gaScripts()).toBe(0);
  });

  it("accepting loads the tag once, with analytics allowed and every ad signal denied", () => {
    ga.setConsent("granted");
    ga.startAnalytics();
    ga.startAnalytics();
    expect(gaScripts()).toBe(1);
    const consent = calls().find((c) => c[0] === "consent" && c[1] === "default")![2] as any;
    expect(consent).toMatchObject({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    const config = calls().find((c) => c[0] === "config")!;
    expect(config[1]).toBe("G-W4GMPQKK5N");
    expect((config[2] as any).send_page_view).toBe(false); // page_view is sent by hand, once
  });

  it("a QR scan without a choice runs cookie-free (analytics storage denied)", () => {
    expect(ga.startAnalytics({ cookieless: true })).toBe(true);
    const consent = calls().find((c) => c[0] === "consent" && c[1] === "default")![2] as any;
    expect(consent.analytics_storage).toBe("denied");
  });

  it("local development never reports to the live property", () => {
    ga.setAnalyticsEnvironment({ allowInDev: false });
    ga.setConsent("granted");
    expect(ga.startAnalytics()).toBe(false);
    expect(gaScripts()).toBe(0);
  });
});

describe("page views", () => {
  it("one per page; the same address twice in a row is not a new visit", () => {
    ga.setConsent("granted");
    expect(ga.trackPageView("https://www.spaholis.com/about", "About")).toBe(true);
    expect(ga.trackPageView("https://www.spaholis.com/about", "About")).toBe(false);
    expect(ga.trackPageView("https://www.spaholis.com/classes", "Classes")).toBe(true);
    expect(events("page_view")).toHaveLength(2);
  });

  it("the router sends exactly one page_view per navigation — and none on the team's tools or QR hops", async () => {
    ga.setConsent("granted");
    let go: (to: string) => void = () => {};
    const Nav = () => { go = useNavigate(); return null; };
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/"]}><AnalyticsTracker /><Nav /></MemoryRouter>);
    });
    try {
      await act(async () => { await sleep(200); });
      for (const to of ["/treatments-therapies", "/classes", "/classes", "/admin", "/retreats?tab=experiences"]) {
        await act(async () => { go(to); });
        await act(async () => { await sleep(200); }); // the page settles, its timer fires
      }
      const pages = events("page_view").map((e) => new URL((e[2] as any).page_location).pathname + new URL((e[2] as any).page_location).search);
      expect(pages).toEqual(["/", "/treatments-therapies", "/classes", "/retreats?tab=experiences"]);
    } finally {
      act(() => root.unmount());
    }
  });

  it("which pages are left out", () => {
    expect(isUntrackedPath("/admin")).toBe(true);
    expect(isUntrackedPath("/es/admin/card-authorization-archive")).toBe(true);
    expect(isUntrackedPath("/teacher")).toBe(true);
    expect(isUntrackedPath("/go/cocos")).toBe(true);
    expect(isUntrackedPath("/test-payment")).toBe(true);
    expect(isUntrackedPath("/treatments-therapies")).toBe(false);
    expect(isUntrackedPath("/es/book")).toBe(false);
  });
});

describe("privacy", () => {
  it("addresses keep campaign tags and drop tokens, emails and the hash", () => {
    const u = ga.safeUrl("https://www.spaholis.com/classes?m=SECRET&utm_source=instagram&utm_medium=social&email=a@b.com&gclid=G1&service=abc#access_token=XYZ");
    expect(u).toBe("https://www.spaholis.com/classes?utm_source=instagram&utm_medium=social&gclid=G1&service=abc");
    expect(ga.safeUrl("https://www.spaholis.com/reset-password?token=abc&type=recovery")).toBe("https://www.spaholis.com/reset-password");
  });

  it("event parameters never carry a name, email, phone or token", () => {
    const out = ga.scrubParams({
      item_name: "Pure Bliss", guest_name: "Ana", email: "ana@x.com", phone: "8888", note: "write to ana@x.com",
      access_token: "t", pass_code: "1234", value: 10, page_title: "Book",
    });
    expect(out).toEqual({ item_name: "Pure Bliss", value: 10, page_title: "Book" });
  });

  it("the page_view sent has no private parameter", () => {
    ga.setConsent("granted");
    ga.trackPageView("https://www.spaholis.com/classes?m=TOKEN123");
    expect(JSON.stringify(calls())).not.toMatch(/TOKEN123/);
  });
});

describe("campaign attribution", () => {
  it("UTM tags of the first page are kept even if the visitor accepts on a later page", async () => {
    window.history.replaceState(null, "", "/?utm_source=instagram&utm_medium=social&utm_campaign=bio");
    vi.resetModules();
    const fresh = await import("@/lib/analytics");
    fresh.__resetAnalyticsForTests();
    fresh.setAnalyticsEnvironment({ allowInDev: true });
    window.history.replaceState(null, "", "/treatments-therapies");
    fresh.setConsent("granted");
    const config = calls().find((c) => c[0] === "config")![2] as any;
    expect(config).toMatchObject({ campaign_source: "instagram", campaign_medium: "social", campaign_name: "bio" });
    window.history.replaceState(null, "", "/");
  });
});

describe("booking conversions", () => {
  const paid = {
    transaction_id: "b1", booking_type: "class" as const, item_id: "c1", item_name: "Vinyasa",
    value: 23, payment_method: "paypal", payment_status: "paid" as const,
  };

  it("a verified paid booking sends booking_complete and purchase (revenue), in USD", () => {
    ga.setConsent("granted");
    expect(ga.trackBookingComplete(paid)).toBe(true);
    expect(events("booking_complete")[0][2]).toMatchObject({ transaction_id: "b1", value: 23, currency: "USD", payment_status: "paid" });
    expect(events("purchase")[0][2]).toMatchObject({ transaction_id: "b1", value: 23, currency: "USD" });
  });

  it("the same transaction is never counted twice — not even after a reload", () => {
    ga.setConsent("granted");
    ga.trackBookingComplete(paid);
    expect(ga.trackBookingComplete(paid)).toBe(false);
    ga.__resetAnalyticsForTests(); // a reload: memory gone, the browser remembers
    ga.setAnalyticsEnvironment({ allowInDev: true });
    ga.setConsent("granted");
    expect(ga.trackBookingComplete(paid)).toBe(false);
    expect(events("booking_complete")).toHaveLength(1);
    expect(events("purchase")).toHaveLength(1);
  });

  it("a confirmed booking paid later is a booking, not revenue", () => {
    ga.setConsent("granted");
    ga.trackBookingComplete({ ...paid, transaction_id: "b2", payment_method: "card_on_file", payment_status: "confirmed" });
    expect(events("booking_complete")).toHaveLength(1);
    expect(events("purchase")).toHaveLength(0);
  });

  it("nothing is counted without consent", () => {
    expect(ga.trackBookingComplete(paid)).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });

  it("each flow reports only after its real confirmation", () => {
    const classes = read("src/pages/ClassBooking.tsx");
    expect(classes).toMatch(/Called only after paypal-capture-order verified the payment[\s\S]{0,500}payment_method: "paypal", payment_status: "paid"/);
    const ret = read("src/pages/BookingReturn.tsx");
    expect(ret).toMatch(/if \(finalStatus === "paid"\) \{[\s\S]{0,400}trackBookingComplete\(/);
    expect(ret.match(/trackBookingComplete\(/g)).toHaveLength(1);
    expect(read("src/pages/Booking.tsx")).toMatch(/payment_method: "card_on_file", payment_status: "confirmed"/);
    expect(read("src/components/OfferingsPurchaseSection.tsx")).toMatch(/res\?\.userOfferingId[\s\S]{0,600}payment_status: "paid"/);
  });

  it("the BAC redirect itself is never counted", () => {
    const classes = read("src/pages/ClassBooking.tsx");
    const redirect = classes.slice(classes.indexOf("window.location.href = data.bacLink"));
    expect(redirect.slice(0, 40)).not.toMatch(/track/);
    expect(classes.slice(classes.indexOf("data.needsPayment && data.bacLink"), classes.indexOf("window.location.href = data.bacLink"))).not.toMatch(/trackBookingComplete/);
  });
});

describe("clicks", () => {
  it("booking links and WhatsApp links are recognized", () => {
    expect(bookingLinkType("/book?service=abc")).toBe("treatment");
    expect(bookingLinkType("/es/class-booking?class=x")).toBe("class");
    expect(bookingLinkType("/experience-booking?experience=y")).toBe("experience");
    expect(bookingLinkType("/book?service=consultation")).toBe("request");
    expect(bookingLinkType("/about")).toBeNull();
    expect(isWhatsAppHref("https://wa.me/50688146760")).toBe(true);
    expect(isWhatsAppHref("https://api.whatsapp.com/send?phone=506")).toBe(true);
    expect(isWhatsAppHref("https://www.spaholis.com")).toBe(false);
  });

  it("clicking them sends click_book_now and click_whatsapp, once each", async () => {
    ga.setConsent("granted");
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/treatments-therapies"]}>
          <AnalyticsTracker />
          <a id="book" href="/book?service=s1">Book Now</a>
          <a id="wa" href="https://api.whatsapp.com/send?phone=50688146760">Chat on WhatsApp</a>
        </MemoryRouter>,
      );
    });
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("click", stop);
    await act(async () => { (el.querySelector("#book") as HTMLElement).click(); (el.querySelector("#wa") as HTMLElement).click(); });
    document.removeEventListener("click", stop);
    expect(events("click_book_now")).toHaveLength(1);
    expect(events("click_book_now")[0][2]).toMatchObject({ booking_type: "treatment", item_id: "s1", link_text: "Book Now" });
    expect(events("click_whatsapp")).toHaveLength(1);
    act(() => root.unmount());
  });
});

describe("the consent banner", () => {
  it("asks once, and Accept starts analytics", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<MemoryRouter><ConsentBanner /></MemoryRouter>); });
    await act(async () => { await sleep(1000); });
    const accept = [...el.querySelectorAll("button")].find((b) => b.textContent === "Accept")!;
    expect(accept).toBeTruthy();
    expect(gaScripts()).toBe(0);
    await act(async () => { accept.click(); await sleep(600); });
    expect(ga.getConsent()).toBe("granted");
    expect(gaScripts()).toBe(1);
    act(() => root.unmount());
  });

  it("Decline is remembered and nothing loads", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<MemoryRouter><ConsentBanner /></MemoryRouter>); });
    await act(async () => { await sleep(1000); });
    await act(async () => { [...el.querySelectorAll("button")].find((b) => b.textContent === "Decline")!.click(); await sleep(600); });
    expect(ga.getConsent()).toBe("denied");
    expect(gaScripts()).toBe(0);
    act(() => root.unmount());
  });

  it("is not shown on QR hops or the team's tools, and is bilingual", () => {
    const src = read("src/components/ConsentBanner.tsx");
    expect(src).toMatch(/if \(isUntrackedPath\(pathname\)\) return null;/);
    expect(src).toMatch(/accept: "Aceptar"/);
    expect(src).toMatch(/decline: "Rechazar"/);
  });
});

describe("QR scans stay counted", () => {
  it("the /go page sends one page_view and partner_qr_scan with its three parameters", () => {
    const page = read("src/pages/PartnerRedirect.tsx");
    expect(page).toMatch(/startAnalytics\(\{ cookieless: true \}\)/);
    expect(page).toMatch(/trackPageView\(\);\s+window\.gtag\("event", "partner_qr_scan", \{\s+partner: link\.partner,\s+\.\.\.\(link\.property \? \{ property: link\.property \} : \{\}\),\s+placement: link\.placement,\s+destination: link\.destination,/);
  });

  it("view_service is sent when a service window opens", () => {
    expect(read("src/components/ServiceDetailModal.tsx")).toMatch(/if \(!open \|\| !service\) return;\s+trackViewService\(/);
  });

  it("the privacy policy explains analytics in English and Spanish", () => {
    const p = read("src/pages/Privacy.tsx");
    expect(p).toMatch(/Google Analytics/);
    expect(p).toMatch(/Cookies y análisis/);
    expect(p).toMatch(/<CookieChoice \/>/);
  });
});

describe("treatment pages", () => {
  it("opening a treatment in the list is a view_service; the one open by default is not", () => {
    const page = read("src/pages/Services.tsx");
    expect(page).toMatch(/onValueChange=\{\(v\) => \{[\s\S]{0,300}trackViewService\(/);
    expect(page).toMatch(/defaultValue=\{groupEntries\[0\]\?\.\[0\]\}/);
  });
});
