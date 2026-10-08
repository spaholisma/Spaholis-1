import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { stripLangPrefix } from "@/i18n/LanguageProvider";
import { getConsent, onConsentChange, startAnalytics, track, trackPageView } from "@/lib/analytics";

/** Pages whose visits are not about the public website: the team's tools, test pages, QR hops. */
export function isUntrackedPath(pathname: string): boolean {
  const p = stripLangPrefix(pathname);
  return /^\/(admin|teacher|test-payment|go)(\/|$)/.test(p);
}

/** Which booking a link starts, from its address — or null when it isn't a booking link. */
export function bookingLinkType(href: string): string | null {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const p = stripLangPrefix(u.pathname);
    if (p === "/book") return u.searchParams.get("service") === "consultation" ? "request" : "treatment";
    if (p === "/class-booking") return "class";
    if (p === "/experience-booking") return "experience";
    return null;
  } catch {
    return null;
  }
}

export const isWhatsAppHref = (href: string) =>
  /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\b|^whatsapp:/i.test(href);

/**
 * Site-wide measurement, mounted once inside the router:
 *  - one page_view per navigation (after the page has set its title);
 *  - click_book_now and click_whatsapp from any link on the site, so no
 *    button has to remember to report itself.
 * Nothing is sent before consent (lib/analytics enforces it).
 */
export function AnalyticsTracker() {
  const { pathname, search } = useLocation();

  // Already accepted on an earlier visit: start right away.
  useEffect(() => {
    if (getConsent() === "granted") startAnalytics();
    // Accepting on this page counts this page.
    return onConsentChange((c) => {
      if (c === "granted" && !isUntrackedPath(window.location.pathname)) trackPageView();
    });
  }, []);

  useEffect(() => {
    if (isUntrackedPath(pathname)) return;
    // The page sets its <title> as it renders; wait for it. The address is the
    // router's, so it is always the page just opened.
    const href = window.location.origin + pathname + search;
    const t = window.setTimeout(() => trackPageView(href), 120);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isUntrackedPath(window.location.pathname)) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
      const where = window.location.pathname;
      if (isWhatsAppHref(href)) {
        track("click_whatsapp", { link_text: text, page_path: where });
        return;
      }
      const type = bookingLinkType(href);
      if (type) {
        const u = new URL(href, window.location.origin);
        track("click_book_now", {
          booking_type: type,
          item_id: u.searchParams.get("service") || u.searchParams.get("class") || u.searchParams.get("experience") || undefined,
          link_text: text,
          page_path: where,
        });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
