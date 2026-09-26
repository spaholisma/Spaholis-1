/**
 * Google Analytics 4 — loaded only where it is used (the /go partner links),
 * so the rest of the site is unchanged.
 */
export const GA4_MEASUREMENT_ID = "G-W4GMPQKK5N";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function loadGtag(id = GA4_MEASUREMENT_ID): Gtag {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    // gtag.js reads the `arguments` objects queued here, so this must stay a plain function.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }
  window.gtag("config", id);
  return window.gtag;
}
