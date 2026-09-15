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
