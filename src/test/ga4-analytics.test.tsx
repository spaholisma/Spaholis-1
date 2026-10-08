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

  it("there is no cookie-free mode any more: without consent, nothing — QR pages included", () => {
    expect(read("src/lib/analytics.ts")).not.toMatch(/cookieless/);
    expect(ga.startAnalytics()).toBe(false);
  });
});

describe("previews and test copies never reach the production property", () => {
  it("only www.spaholis.com and spaholis.com report", () => {
    expect(ga.isProductionHost("www.spaholis.com")).toBe(true);
    expect(ga.isProductionHost("spaholis.com")).toBe(true);
    expect(ga.isProductionHost("spaholis-1-git-ga4-tracking-spaholis.vercel.app")).toBe(false);
    expect(ga.isProductionHost("localhost")).toBe(false);
  });

  it("on any other host nothing loads, even after Accept", () => {
    ga.setAnalyticsEnvironment({ allowInDev: false }); // jsdom runs on localhost
    ga.setConsent("granted");
    expect(ga.startAnalytics()).toBe(false);
    expect(gaScripts()).toBe(0);
  });

  it("?ga_debug=1 is the only way in, and then every hit is marked debug_mode", () => {
    ga.setAnalyticsEnvironment({ allowInDev: false });
    window.history.replaceState(null, "", "/?ga_debug=1");
    ga.setConsent("granted");
    expect(ga.startAnalytics()).toBe(true);
    expect((calls().find((c) => c[0] === "config")![2] as any).debug_mode).toBe(true);
    // …and the flag itself never reaches Google
    ga.trackPageView();
    expect(JSON.stringify(events("page_view"))).not.toMatch(/ga_debug/);
    window.history.replaceState(null, "", "/");
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
    value: 23, payment_method: "paypal", payment_status: "paid_online" as const,
  };

  it("a verified paid booking sends booking_complete and purchase (revenue), in USD", () => {
    ga.setConsent("granted");
    expect(ga.trackBookingComplete(paid)).toBe(true);
    const tx = ga.transactionKey("b1");
    expect(events("booking_complete")[0][2]).toMatchObject({ transaction_id: tx, booking_value: 23, currency: "USD", payment_status: "paid_online" });
    expect(events("purchase")[0][2]).toMatchObject({ transaction_id: tx, value: 23, currency: "USD" });
  });

  it("bookings, payments and revenue stay apart: only purchase carries GA's money field", () => {
    ga.setConsent("granted");
    ga.trackBookingComplete(paid);
    ga.trackViewService({ booking_type: "treatment", item_id: "s", item_name: "Pure Bliss", value: 101 });
    ga.trackBeginBooking({ booking_type: "treatment", item_id: "s", item_name: "Pure Bliss", value: 101 });
    const withValue = events().filter((e) => (e[2] as any)?.value !== undefined).map((e) => e[1]);
    expect(withValue).toEqual(["purchase"]);
    expect((events("view_service")[0][2] as any).price).toBe(101);
    expect((events("booking_complete")[0][2] as any).value).toBeUndefined();
  });

  it("GA never sees the booking id (its first 8 characters are the guest's confirmation code)", () => {
    ga.setConsent("granted");
    const id = "7aa1c831-474b-43c2-89a9-9964ba0feab3";
    ga.trackBookingComplete({ ...paid, transaction_id: id });
    const sent = JSON.stringify(calls());
    expect(sent).not.toMatch(/7aa1c831/i);
    expect(ga.transactionKey(id)).toMatch(/^tx_[0-9a-f]{16}$/);
    expect(ga.transactionKey(id)).toBe(ga.transactionKey(id));
    expect(ga.transactionKey(id)).not.toBe(ga.transactionKey("7aa1c831-474b-43c2-89a9-9964ba0feab4"));
    expect(localStorage.getItem("holis_ga_sent_tx")).not.toMatch(/7aa1c831/i);
  });

  it("each way of settling has its own status", () => {
    expect(read("src/pages/Booking.tsx")).toMatch(/payment_method: "card_on_file", payment_status: "pay_later"/);
    expect(read("src/pages/ExperienceBooking.tsx")).toMatch(/payment_status: "pay_later"/);
    const classes = read("src/pages/ClassBooking.tsx");
    expect(classes).toMatch(/payment_method: "free", payment_status: "free"/);
    expect(classes).toMatch(/payment_method: payMethod, payment_status: "covered"/);
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
    ga.trackBookingComplete({ ...paid, transaction_id: "b2", payment_method: "card_on_file", payment_status: "pay_later" });
    expect(events("booking_complete")).toHaveLength(1);
    expect(events("purchase")).toHaveLength(0);
  });

  it("nothing is counted without consent", () => {
    expect(ga.trackBookingComplete(paid)).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });

  it("each flow reports only after its real confirmation", () => {
    const classes = read("src/pages/ClassBooking.tsx");
    expect(classes).toMatch(/Called only after paypal-capture-order verified the payment[\s\S]{0,500}payment_method: "paypal", payment_status: "paid_online"/);
    const ret = read("src/pages/BookingReturn.tsx");
    expect(ret).toMatch(/if \(finalStatus === "paid"\) \{[\s\S]{0,400}trackBookingComplete\(/);
    expect(ret.match(/trackBookingComplete\(/g)).toHaveLength(1);
        expect(read("src/components/OfferingsPurchaseSection.tsx")).toMatch(/res\?\.userOfferingId[\s\S]{0,600}payment_status: "paid_online"/);
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
  it("every scan is counted on our server; Google hears of it only with consent", () => {
    const page = read("src/pages/PartnerRedirect.tsx");
    expect(page).toMatch(/const counted = recordQrScan\(slug, link\);/);
    expect(page).toMatch(/if \(!startAnalytics\(\) \|\| !window\.gtag\) \{/);
    const sql = read("supabase/migrations/20261008120000_partner_qr_scans.sql");
    expect(sql).not.toMatch(/(ip|user_agent|cookie|device|email|phone)\s+(text|inet)/i);
    expect(sql).toMatch(/grant execute on function public\.record_partner_qr_scan\(text, text, text, text\) to anon, authenticated;/);
    expect(sql).toMatch(/for select using \(\s+public\.has_role\(auth\.uid\(\), 'super_admin'/);
  });

  it("with consent, the /go page still sends one page_view and partner_qr_scan with its three parameters", () => {
    const page = read("src/pages/PartnerRedirect.tsx");
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

describe("the privacy policy says what really happens", () => {
  const p = read("src/pages/Privacy.tsx");
  it("cards on file: stored encrypted, never the CVV — no longer 'we never store full card numbers'", () => {
    expect(p).not.toMatch(/never store full card numbers/);
    expect(p).toMatch(/in\s+encrypted form/);
    expect(p).toMatch(/never store the card's security code\s+\(CVV\)/);
  });
  it("QR scans: counted on our server; Google only with consent", () => {
    expect(p).toMatch(/count the scan on\s+our own server/);
    expect(p).toMatch(/contamos el\s+escaneo en nuestro propio servidor/);
  });
});
