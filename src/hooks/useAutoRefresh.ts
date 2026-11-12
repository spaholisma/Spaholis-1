import { useEffect, useRef } from "react";

/** How often the shared admin calendars ask the database again. */
export const CALENDAR_REFRESH_MS = 15_000;

/**
 * Asks for fresh data every few seconds while the page is in view, and at once
 * when someone comes back to the tab — so several people working on the same
 * calendar see each other's changes without reloading the page.
 *
 * Nothing runs while the tab is hidden (no point, and no wasted requests).
 * `refresh` may change on every render; the latest one is always used.
 */
export function useAutoRefresh(refresh: () => unknown, ms = CALENDAR_REFRESH_MS, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      try { void latest.current(); } catch { /* a failed refresh waits for the next one */ }
    };
    const id = window.setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [ms, enabled]);
}
