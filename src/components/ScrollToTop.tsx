import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isSamePage, scrollToSection } from "@/lib/scrollToTop";

/**
 * Every page starts at the top: when the site is opened or refreshed, and
 * when moving to another page. A link to a section (/about#team, #buy…) goes
 * to that section — every time it is clicked, also when you are already on
 * that page. A language switch or a tab on the same page keeps the position.
 */
export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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

  // A section link: go to it. Keyed on the navigation itself, so clicking the
  // same link again (after scrolling away) still brings the section back.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    return scrollToSection(id, { smooth: !reduceMotion });
  }, [hash, key, reduceMotion]);

  return null;
}
