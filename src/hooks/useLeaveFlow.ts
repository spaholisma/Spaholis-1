import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";

/**
 * Leaving a booking or request form by its own "Back" button, so nobody has
 * to reach for the browser's.
 *
 * When the guest came from another page of the site, it goes back there — the
 * treatment, the class, the retreat they were reading. When they arrived
 * straight on the form (a link in an email, a new tab), there is nothing on
 * the site to go back to, so it goes to the section the form belongs to.
 * React Router numbers its history entries (`history.state.idx`); 0 means this
 * is the first page of the visit.
 */
export function canGoBackInSite(state: unknown = typeof window !== "undefined" ? window.history.state : null): boolean {
  const idx = (state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

export function useLeaveFlow(fallback: string) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  return useCallback(() => {
    if (canGoBackInSite()) navigate(-1);
    else navigate(withLangPrefix(fallback, language));
  }, [navigate, fallback, language]);
}
