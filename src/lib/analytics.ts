/**
 * Google Analytics 4 for the whole site — one place, one tag, one stream.
 *
 * - Nothing loads until the visitor accepts analytics cookies (the banner) —
 *   QR scans included: without consent they are counted on our own server
 *   (lib/qrScans), never sent to Google.
 * - Only the real site reports (www.spaholis.com): previews and local copies
 *   never do, unless ?ga_debug=1 — and then every hit is marked debug_mode,
 *   which GA's "Developer traffic" filter keeps out of the reports.
 * - Every page counts once: page_view is sent by hand on each route change
 *   (GA's automatic one is switched off with send_page_view: false).
 * - Addresses are cleaned before they leave the browser: only campaign and
 *   harmless navigation parameters are kept — never tokens, emails or names.
 * - Three separate numbers: confirmed bookings (`booking_complete`), paid
 *   transactions and revenue (`purchase`, only when our server verified the
 *   payment). Each counted once per transaction, under a one-way id.
 */
import { initialUrl } from "@/lib/initialUrl";

export const GA4_MEASUREMENT_ID = "G-W4GMPQKK5N";
export const CONSENT_STORAGE_KEY = "holis_cookie_consent_v1";
const SENT_TX_KEY = "holis_ga_sent_tx";

export type Consent = "granted" | "denied";
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// ─────────────────────────── Never in the way ───────────────────────────

/**
 * Measuring must never break what it measures: every function a page calls is
 * wrapped, so a blocked browser, full storage or a script error inside
 * Analytics just means "not counted" — the booking or payment carries on.
 */
function safely<A extends unknown[], R>(fn: (...args: A) => R, fallback: R): (...args: A) => R {
  return (...args: A) => {
    try {
      return fn(...args);
    } catch {
      return fallback;
    }
  };
}

// ─────────────────────────── Environment ───────────────────────────

/** The only addresses that report to the production property. */
export const PRODUCTION_HOSTS = ["www.spaholis.com", "spaholis.com"];

let allowInDev = false;
/** Tests run on localhost: they may switch reporting on. */
export function setAnalyticsEnvironment(opts: { allowInDev?: boolean }) {
  if (opts.allowInDev !== undefined) allowInDev = opts.allowInDev;
}

function debugRequested(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("ga_debug") === "1") {
      sessionStorage.setItem("holis_ga_debug", "1");
      return true;
    }
    return sessionStorage.getItem("holis_ga_debug") === "1";
  } catch {
    return false;
  }
}

/** Previews (*.vercel.app), local copies and any other host stay silent. */
export const isProductionHost = (host = window.location.hostname) => PRODUCTION_HOSTS.includes(host);
const devBlocked = () => !allowInDev && !debugRequested() && !isProductionHost();

// ─────────────────────────── Clean addresses ───────────────────────────

/** The only query parameters that may reach Google: campaigns and harmless navigation. */
const SAFE_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
  "gclid", "gbraid", "wbraid", "dclid", "fbclid", "srsltid",
  "service", "class", "experience", "category", "tab", "topic",
]);

/** The address without the hash and without any parameter not listed above. */
export function safeUrl(href: string): string {
  try {
    const u = new URL(href, window.location.origin);
    const out = new URL(u.origin + u.pathname);
    u.searchParams.forEach((v, k) => {
      if (SAFE_PARAMS.has(k.toLowerCase())) out.searchParams.append(k, v);
    });
    return out.toString();
  } catch {
    return window.location.origin + "/";
  }
}

/** Where the visitor came from — origin and path only (another site's query may carry anything). */
function safeReferrer(ref: string): string | undefined {
  if (!ref) return undefined;
  try {
    const u = new URL(ref);
    if (u.origin === window.location.origin) return undefined;
    return u.origin + u.pathname;
  } catch {
    return undefined;
  }
}

/** The visit's first address and referrer, kept so a later "Accept" still credits the campaign. */
const landing = (() => {
  const params = new URLSearchParams(initialUrl.search || "");
  const pick = (k: string) => params.get(k) || undefined;
  return {
    referrer: typeof document !== "undefined" ? safeReferrer(document.referrer) : undefined,
    campaign: {
      campaign_source: pick("utm_source"),
      campaign_medium: pick("utm_medium"),
      campaign_name: pick("utm_campaign"),
      campaign_term: pick("utm_term"),
      campaign_content: pick("utm_content"),
      campaign_id: pick("utm_id"),
    },
  };
})();

const defined = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

// ─────────────────────────── Personal data guard ───────────────────────────

const PII_KEYS = /(^|_)(email|e_mail|phone|tel|name|first_name|last_name|guest|address|token|password|card|code)($|_)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const ALLOWED_NAME_KEYS = new Set(["item_name", "page_title", "link_text", "event_name"]);

/** Drops anything that could identify a customer, whatever the caller passed. */
export function scrubParams(params: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (PII_KEYS.test(k) && !ALLOWED_NAME_KEYS.has(k)) continue;
    if (typeof v === "string" && EMAIL_RE.test(v)) continue;
    out[k] = v;
  }
  return out;
}

// ─────────────────────────── Consent ───────────────────────────

const listeners = new Set<(c: Consent | null) => void>();

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function onConsentChange(fn: (c: Consent | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The visitor's choice from the banner (or the privacy page). */
export const setConsent = safely(function setConsent(choice: Consent): void {
  try { localStorage.setItem(CONSENT_STORAGE_KEY, choice); } catch { /* private mode: applies to this visit */ }
  remembered = choice;
  if (choice === "granted") startAnalytics();
  else {
    if (mode) { window.gtag?.("consent", "update", { analytics_storage: "denied" }); withdrawn = true; }
    clearAnalyticsCookies();
  }
  listeners.forEach((l) => { try { l(choice); } catch { /* one listener can't stop the others */ } });
}, undefined);

// The choice also lives in memory, so a browser that blocks storage still honours it.
let remembered: Consent | null = null;
const consent = () => remembered ?? getConsent();

// ─────────────────────────── The tag ───────────────────────────

let mode: null | "full" = null;
let withdrawn = false;

/** True while the tag is running and the visitor still agrees — a later "Decline" stops every event. */
export const analyticsActive = () => mode !== null && consent() === "granted";

/** Removes Google Analytics' own cookies (_ga, _ga_<stream>) when the visitor declines. */
function clearAnalyticsCookies(): void {
  try {
    const parts = window.location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
    document.cookie.split(";").map((c) => c.split("=")[0].trim())
      .filter((name) => name === "_ga" || name.startsWith("_ga_"))
      .forEach((name) => domains.forEach((d) => { document.cookie = `${name}=; Max-Age=0; path=/${d}`; }));
  } catch { /* nothing to clear */ }
}

function gtag(...args: unknown[]) {
  window.gtag?.(...args);
}

/** Starts the tag once — only after the visitor accepted, and only on the real site. */
export const startAnalytics = safely(function startAnalytics(): boolean {
  if (typeof window === "undefined" || devBlocked()) return false;
  const granted = consent() === "granted";
  if (!granted) return false;

  if (mode === null) {
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      // gtag.js reads the `arguments` objects queued here, so this must stay a plain function.
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
    }
    gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    gtag("js", new Date());
    gtag("config", GA4_MEASUREMENT_ID, defined({
      send_page_view: false,
      page_location: safeUrl(window.location.href),
      ...landing.campaign,
      debug_mode: debugRequested() ? true : undefined,
    }));
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
    document.head.appendChild(s);
    mode = "full";
  } else if (withdrawn) {
    // Accepted again after a "Decline" earlier in the same visit.
    gtag("consent", "update", { analytics_storage: "granted" });
    withdrawn = false;
  }
  return true;
}, false);

// ─────────────────────────── Page views ───────────────────────────

let lastPage = "";
let firstPageSent = false;

/** One page_view per page. The same address twice in a row is not a new visit. */
export const trackPageView = safely(function trackPageView(href: string = window.location.href, title: string = document.title): boolean {
  if (!analyticsActive()) return false;
  const url = safeUrl(href);
  if (url === lastPage) return false;
  lastPage = url;
  gtag("event", "page_view", defined({
    page_location: url,
    page_title: title,
    page_referrer: firstPageSent ? undefined : landing.referrer,
  }));
  firstPageSent = true;
  return true;
}, false);

// ─────────────────────────── Events ───────────────────────────

/** Any event, scrubbed of personal data. Does nothing before consent. */
export const track = safely(function track(event: string, params: Record<string, unknown> = {}): boolean {
  if (!analyticsActive()) return false;
  gtag("event", event, scrubParams(params));
  return true;
}, false);

export type BookingType = "treatment" | "class" | "experience" | "membership" | "retreat";

export interface BookingItem {
  booking_type: BookingType;
  item_id?: string | null;
  item_name?: string | null;
  item_category?: string | null;
  value?: number;
  quantity?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

// `value` is GA's money field: only `purchase` carries it, so GA's revenue is
// only money really paid. Views and starts say the price; bookings their value.
const itemParams = (b: BookingItem, money: "price" | "booking_value") => defined({
  booking_type: b.booking_type,
  item_id: b.item_id ?? undefined,
  item_name: b.item_name ?? undefined,
  item_category: b.item_category ?? undefined,
  [money]: b.value !== undefined ? round(b.value) : undefined,
  currency: b.value !== undefined ? "USD" : undefined,
  quantity: b.quantity,
});

export const trackViewService = (b: BookingItem) => track("view_service", itemParams(b, "price"));
export const trackBeginBooking = (b: BookingItem) => track("begin_booking", itemParams(b, "price"));

/**
 * A one-way id for a booking (cyrb53 hash, plain numbers — no BigInt, which
 * older iPhones can't even read). GA gets this instead of the booking id,
 * whose first 8 characters are the guest's confirmation code.
 */
export function transactionKey(id: string): string {
  let h1 = 0xdeadbeef ^ 0x5bd1e995;
  let h2 = 0x41c6ce57 ^ 0x5bd1e995;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return "tx_" + hex(h2) + hex(h1);
}

function alreadySent(txId: string): boolean {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SENT_TX_KEY) || "[]");
    return list.includes(txId);
  } catch {
    return false;
  }
}
function markSent(txId: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SENT_TX_KEY) || "[]");
    localStorage.setItem(SENT_TX_KEY, JSON.stringify([...list, txId].slice(-100)));
  } catch { /* storage blocked: GA still de-duplicates purchase by transaction_id */ }
}
const sentThisVisit = new Set<string>();

/**
 * How a confirmed booking is settled:
 *  - "paid_online": our server verified the payment (PayPal capture, BAC finalize);
 *  - "pay_later":   confirmed, paid at the visit (card on file, experiences);
 *  - "covered":     paid earlier with a membership or class credits;
 *  - "free":        nothing to pay (free class, 100% coupon).
 */
export type PaymentStatus = "paid_online" | "pay_later" | "covered" | "free";

/**
 * A confirmed booking. Call it only after the confirmation really happened.
 * Sends `booking_complete` (every confirmed booking, with its booking_value),
 * and — only for "paid_online" with money — `purchase`, GA's revenue event.
 * The same transaction is never counted twice.
 */
export const trackBookingComplete = safely(function trackBookingComplete(b: BookingItem & {
  transaction_id: string;
  payment_method: string;
  payment_status: PaymentStatus;
}): boolean {
  if (!analyticsActive() || !b.transaction_id) return false;
  const tx = transactionKey(b.transaction_id);
  if (sentThisVisit.has(tx) || alreadySent(tx)) return false;
  sentThisVisit.add(tx);
  markSent(tx);

  track("booking_complete", {
    ...itemParams(b, "booking_value"),
    transaction_id: tx,
    payment_method: b.payment_method,
    payment_status: b.payment_status,
  });
  const value = Number(b.value ?? 0);
  if (b.payment_status === "paid_online" && value > 0) {
    const qty = Math.max(1, b.quantity ?? 1);
    track("purchase", {
      transaction_id: tx,
      value: round(value),
      currency: "USD",
      payment_type: b.payment_method,
      items: [defined({
        item_id: b.item_id ?? undefined,
        item_name: b.item_name ?? undefined,
        item_category: b.item_category ?? b.booking_type,
        price: round(value / qty),
        quantity: qty,
      })],
    });
  }
  return true;
}, false);

// ─────────────────────────── For tests ───────────────────────────

export function __resetAnalyticsForTests() {
  mode = null;
  withdrawn = false;
  lastPage = "";
  firstPageSent = false;
  remembered = null;
  sentThisVisit.clear();
  listeners.clear();
  allowInDev = false;
}
