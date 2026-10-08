import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cookie } from "lucide-react";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { getConsent, onConsentChange, setConsent } from "@/lib/analytics";
import { isUntrackedPath } from "@/components/AnalyticsTracker";

const COPY = {
  en: {
    title: "A quick note on cookies",
    body: "We'd like to use analytics cookies to see which pages and offers help our guests — never to identify you or for advertising.",
    accept: "Accept",
    decline: "Decline",
    more: "Privacy policy",
  },
  es: {
    title: "Un breve aviso sobre cookies",
    body: "Nos gustaría usar cookies de análisis para saber qué páginas y ofertas ayudan a nuestros huéspedes — nunca para identificarle ni para publicidad.",
    accept: "Aceptar",
    decline: "Rechazar",
    more: "Política de privacidad",
  },
} as const;

/**
 * Asks once whether analytics cookies may be used. Google Analytics does not
 * load until the visitor says yes (see lib/analytics). Sits low on the page,
 * above the WhatsApp button on phones, and never blocks the page.
 */
export function ConsentBanner() {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const t = COPY[language === "es" ? "es" : "en"];

  useEffect(() => {
    // A moment after the page appears, so it doesn't compete with the first impression.
    const timer = window.setTimeout(() => setOpen(getConsent() === null), 900);
    const off = onConsentChange((c) => setOpen(c === null));
    return () => { window.clearTimeout(timer); off(); };
  }, []);

  if (isUntrackedPath(pathname)) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-live="polite"
          aria-label={t.title}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed left-4 right-4 bottom-24 z-[60] sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-sm rounded-2xl border border-border bg-card/95 p-5 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-spa-sage/15 text-spa-sage" aria-hidden="true">
              <Cookie className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-base text-foreground">{t.title}</p>
              <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">
                {t.body}{" "}
                <Link to={withLangPrefix("/privacy", language)} className="underline underline-offset-2 hover:text-foreground">
                  {t.more}
                </Link>
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setConsent("denied")}
              className="flex-1 rounded-full border border-border px-4 py-2 font-body text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {t.decline}
            </button>
            <button
              type="button"
              onClick={() => setConsent("granted")}
              className="flex-1 rounded-full bg-foreground px-4 py-2 font-body text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t.accept}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
