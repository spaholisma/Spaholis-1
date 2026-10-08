/**
 * Google Analytics 4 for the whole site — one place, one tag, one stream.
 *
 * - Nothing loads until the visitor accepts analytics cookies (the banner).
 *   The only exception is a partner QR scan (/go/...): that page lives for a
 *   second before WhatsApp, so it sends the scan cookie-free and without any
 *   identifier (Consent Mode "denied") unless the visitor already accepted.
 * - Every page counts once: page_view is sent by hand on each route change
 *   (GA's automatic one is switched off with send_page_view: false).
 * - Addresses are cleaned before they leave the browser: only campaign and
 *   harmless navigation parameters are kept — never tokens, emails or names.
 * - A booking is counted once per transaction id, and revenue (`purchase`)
 *   only when the payment was verified by our server.
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

// ─────────────────────────── Environment ───────────────────────────

let allowInDev = false;
/** Local development never reports to the live property, unless ?ga_debug=1 (or a test) asks. */
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

const devBlocked = () => import.meta.env.DEV && !allowInDev && !debugRequested();

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
export function setConsent(choice: Consent) {
  try { localStorage.setItem(CONSENT_STORAGE_KEY, choice); } catch { /* private mode: applies to this visit */ }
  remembered = choice;
  if (choice === "granted") startAnalytics();
  else if (mode) window.gtag?.("consent", "update", { analytics_storage: "denied" });
  listeners.forEach((l) => l(choice));
}

// The choice also lives in memory, so a browser that blocks storage still honours it.
let remembered: Consent | null = null;
const consent = () => remembered ?? getConsent();

// ─────────────────────────── The tag ───────────────────────────

let mode: null | "full" | "cookieless" = null;

/** True once the tag is running (after consent, or cookie-free on a QR page). */
export const analyticsActive = () => mode !== null;

function gtag(...args: unknown[]) {
  window.gtag?.(...args);
}

/**
 * Starts the tag once. Without consent it refuses — except `cookieless`, used
 * only by the QR page, which runs it with analytics storage denied.
 */
export function startAnalytics(opts: { cookieless?: boolean } = {}): boolean {
  if (typeof window === "undefined" || devBlocked()) return false;
  const granted = consent() === "granted";
  if (!granted && !opts.cookieless) return false;

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
      analytics_storage: granted ? "granted" : "denied",
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
    mode = granted ? "full" : "cookieless";
  } else if (mode === "cookieless" && granted) {
    gtag("consent", "update", { analytics_storage: "granted" });
    mode = "full";
  }
  return true;
}

/** Kept for older callers: starts the tag the QR way and hands back gtag. */
export function loadGtag(): Gtag {
  startAnalytics({ cookieless: true });
  return (...args: unknown[]) => gtag(...args);
}

// ─────────────────────────── Page views ───────────────────────────

let lastPage = "";
let firstPageSent = false;

/** One page_view per page. The same address twice in a row is not a new visit. */
export function trackPageView(href = window.location.href, title = document.title): boolean {
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
}

// ─────────────────────────── Events ───────────────────────────

/** Any event, scrubbed of personal data. Does nothing before consent. */
export function track(event: string, params: Record<string, unknown> = {}): boolean {
  if (!analyticsActive()) return false;
  gtag("event", event, scrubParams(params));
  return true;
}

export type BookingType = "treatment" | "class" | "experience" | "membership" | "retreat";

export interface BookingItem {
  booking_type: BookingType;
  item_id?: string | null;
  item_name?: string | null;
  item_category?: string | null;
  value?: number;
  quantity?: number;
}

const itemParams = (b: BookingItem) => defined({
  booking_type: b.booking_type,
  item_id: b.item_id ?? undefined,
  item_name: b.item_name ?? undefined,
  item_category: b.item_category ?? undefined,
  value: b.value !== undefined ? Math.round(b.value * 100) / 100 : undefined,
  currency: b.value !== undefined ? "USD" : undefined,
  quantity: b.quantity,
});

export const trackViewService = (b: BookingItem) => track("view_service", itemParams(b));
export const trackBeginBooking = (b: BookingItem) => track("begin_booking", itemParams(b));

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
 * A confirmed booking. Call it only after the confirmation really happened:
 *  - payment_status "paid": our server verified the payment (PayPal capture,
 *    BAC finalize) — also sends GA's `purchase`, so it shows as revenue;
 *  - "confirmed": booked and confirmed, paid later or nothing to pay
 *    (card on file, a membership or credits, a free class) — booking only.
 * The same transaction is never counted twice.
 */
export function trackBookingComplete(b: BookingItem & {
  transaction_id: string;
  payment_method: string;
  payment_status: "paid" | "confirmed";
}): boolean {
  if (!analyticsActive() || !b.transaction_id) return false;
  if (sentThisVisit.has(b.transaction_id) || alreadySent(b.transaction_id)) return false;
  sentThisVisit.add(b.transaction_id);
  markSent(b.transaction_id);

  track("booking_complete", {
    ...itemParams(b),
    transaction_id: b.transaction_id,
    payment_method: b.payment_method,
    payment_status: b.payment_status,
  });
  const value = Number(b.value ?? 0);
  if (b.payment_status === "paid" && value > 0) {
    const qty = Math.max(1, b.quantity ?? 1);
    track("purchase", {
      transaction_id: b.transaction_id,
      value: Math.round(value * 100) / 100,
      currency: "USD",
      payment_type: b.payment_method,
      items: [defined({
        item_id: b.item_id ?? undefined,
        item_name: b.item_name ?? undefined,
        item_category: b.item_category ?? b.booking_type,
        price: Math.round((value / qty) * 100) / 100,
        quantity: qty,
      })],
    });
  }
  return true;
}

// ─────────────────────────── For tests ───────────────────────────

export function __resetAnalyticsForTests() {
  mode = null;
  lastPage = "";
  firstPageSent = false;
  remembered = null;
  sentThisVisit.clear();
  listeners.clear();
  allowInDev = false;
}
