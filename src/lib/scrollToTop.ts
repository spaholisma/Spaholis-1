import { stripLangPrefix } from "@/i18n/LanguageProvider";

// Paths that are one page with several tabs in the URL: switching tab keeps
// the reader where they are (the page scrolls to the list itself).
const TABBED_PAGES = ["/treatments-therapies"];

const base = (path: string) => {
  const p = stripLangPrefix(path).replace(/\/+$/, "");
  return p || "/";
};

/**
 * True when moving from `from` to `to` stays on the same page — a language
 * switch (/about → /es/about) or a tab of a tabbed page — so the scroll
 * position is kept. Any other change of page starts at the top.
 */
export function isSamePage(from: string, to: string): boolean {
  const a = base(from);
  const b = base(to);
  if (a === b) return true;
  return TABBED_PAGES.some((p) => (a === p || a.startsWith(`${p}/`)) && (b === p || b.startsWith(`${p}/`)));
}

/**
 * Bring the section `id` into view — for menu links such as /about#team.
 *
 * The page may still be loading (its code, its content, its photos), so this
 * waits for the section to exist and for the layout around it to stop moving,
 * then scrolls once, smoothly. If photos above it finish loading and push it
 * down, it corrects once more. Returns a function that cancels it.
 */
export function scrollToSection(id: string, opts: { smooth?: boolean } = {}): () => void {
  const behavior: ScrollBehavior = opts.smooth === false ? "auto" : "smooth";
  const timers: number[] = [];
  let cancelled = false;
  let lastTop: number | null = null;
  let tries = 0;
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

  const settle = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (!el) { if (tries++ < 40) later(settle, 100); return; }
    // Wait until the section stops moving (content and photos still arriving).
    const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
    if (lastTop !== top && tries++ < 40) { lastTop = top; later(settle, 120); return; }
    el.scrollIntoView({ behavior, block: "start" });
    // One correction, in case something above it grew after we started.
    later(() => {
      if (cancelled) return;
      const offset = el.getBoundingClientRect().top;
      const target = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (Math.abs(offset - target) > 48) el.scrollIntoView({ behavior, block: "start" });
    }, 900);
  };

  later(settle, 60);
  return () => { cancelled = true; timers.forEach(clearTimeout); };
}
