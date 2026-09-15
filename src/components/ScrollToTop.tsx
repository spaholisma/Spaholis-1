import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isSamePage } from "@/lib/scrollToTop";

/**
 * Every page starts at the top: when the site is opened or refreshed, and
 * when moving to another page. Links to a section (#team, #buy…) are left to
 * the page, which scrolls to that section; a language switch or a tab on the
 * same page keeps the current position.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const previous = useRef<string | null>(null);

  // The browser would otherwise put a refreshed page back where it was.
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (hash) return;
    if (from !== null && isSamePage(from, pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
