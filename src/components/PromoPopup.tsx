import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Clock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useServicesByCategory } from "@/hooks/useServices";
import { content as defaults } from "@/data/content";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { formatCRCWithUsd } from "@/lib/currency";
import { shouldShowPromo } from "@/lib/promoPopup";
import { programDuration, WELLNESS_PROGRAMS_CATEGORY, WELLNESS_PROGRAMS_PATH } from "@/lib/wellnessPrograms";

/**
 * Promo window for the Wellness Programs. Opens a moment after the site is
 * opened or refreshed (not on every in-app page change), never on booking,
 * checkout, sign-in or admin pages, and closes with the X, "Maybe later",
 * Escape or a click outside.
 */
export function PromoPopup() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const { data: siteContent } = useSiteContent();
  const { grouped, isLoading } = useServicesByCategory();
  const programs = grouped[WELLNESS_PROGRAMS_CATEGORY] ?? [];
  const c = { ...defaults.promoPopup, ...((siteContent as any)?.promoPopup || {}) };

  const [open, setOpen] = useState(false);
  const scheduled = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (scheduled.current || isLoading || !c.enabled || programs.length === 0) return;
    // Not inside the admin's content-editor preview frame.
    if (typeof window === "undefined" || window.self !== window.top) return;
    scheduled.current = true;
    const t = window.setTimeout(() => {
      if (shouldShowPromo(pathRef.current)) setOpen(true);
    }, Math.max(0, Number(c.delaySeconds) || 0) * 1000);
    return () => window.clearTimeout(t);
  }, [isLoading, programs.length, c.enabled, c.delaySeconds]);

  // Moving to a page where it doesn't belong (e.g. straight to /book) closes it.
  useEffect(() => {
    if (open && !shouldShowPromo(pathname)) setOpen(false);
  }, [open, pathname]);

  const close = () => setOpen(false);
  const programsHref = withLangPrefix(WELLNESS_PROGRAMS_PATH, language);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-300" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-[880px] -translate-x-1/2 -translate-y-1/2 max-h-[92dvh] overflow-y-auto overflow-x-hidden rounded-[1.75rem] bg-background shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] duration-300"
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md backdrop-blur transition hover:scale-105 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-spa-sage"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="grid md:grid-cols-[1fr_1.1fr]">
            {/* Image side */}
            <div className="relative min-h-[160px] sm:min-h-[240px] md:min-h-[540px] overflow-hidden">
              <motion.img
                src={c.image}
                alt=""
                initial={{ scale: 1.12 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.6, ease: "easeOut" }}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-spa-sage px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow">
                <Sparkles className="h-3 w-3" /> {c.badge}
              </span>
              <p className="absolute bottom-5 left-5 right-5 font-body text-xs font-medium uppercase tracking-[0.25em] text-white/90">
                {c.imageCaption}
              </p>
            </div>

            {/* Content side */}
            <div className="relative flex flex-col gap-4 p-6 sm:gap-5 sm:p-10">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-spa-sage/10 blur-2xl" />

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="relative space-y-3"
              >
                <p className="flex items-center gap-3 font-body text-xs font-semibold uppercase tracking-[0.25em] text-spa-sage">
                  <span className="h-px w-8 bg-spa-sage/60" /> {c.eyebrow}
                </p>
                <DialogPrimitive.Title className="font-heading text-[1.7rem] sm:text-4xl font-light leading-tight text-foreground">
                  {c.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
                  {c.text}
                </DialogPrimitive.Description>
              </motion.div>

              <ul className="relative space-y-2">
                {programs.slice(0, 3).map((p, i) => (
                  <motion.li
                    key={p.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, delay: 0.3 + i * 0.08 }}
                  >
                    <Link
                      to={programsHref}
                      onClick={close}
                      className="group flex items-center gap-3 sm:gap-4 rounded-2xl border border-border bg-card/60 px-4 py-2.5 sm:py-3 transition hover:border-spa-sage/50 hover:bg-spa-sage/5"
                    >
                      <span className="font-heading text-sm text-spa-sage/70">0{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-heading text-lg leading-tight text-foreground">{p.title}</span>
                        <span className="flex items-center gap-1 font-body text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {programDuration(p.duration_minutes)}
                        </span>
                      </span>
                      <span className="font-heading text-base font-semibold text-foreground">{formatCRCWithUsd(p.price)}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-spa-sage" />
                    </Link>
                  </motion.li>
                ))}
              </ul>

              <div className="relative mt-auto flex flex-col gap-2 pt-1">
                <Button asChild size="lg" className="font-body bg-spa-sage text-white hover:bg-spa-sage/90">
                  <Link to={programsHref} onClick={close}>
                    {c.ctaText} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={close}
                  className="mx-auto py-1 font-body text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {c.dismissText}
                </button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
