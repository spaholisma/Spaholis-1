import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useNavMenu } from "@/hooks/useNavMenu";
import { content as defaults } from "@/data/content";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import holisLogo from "@/assets/holis-logo-clean.png";

interface NavItem {
  labelKey?: string;
  label: string;
  to: string;
}
interface NavEntry extends NavItem {
  children?: NavItem[];
  cta?: boolean;
}

// Menu structure. Parent `to` links to an existing page; children reuse existing
// routes (see the reorg notes). Deep-links to Treatments categories use the
// ?category= param; About sub-sections use #anchors; Retreats use the ?tab param.
const MENU: NavEntry[] = [
  { labelKey: "nav.home", label: "Home", to: "/" },
  {
    labelKey: "nav.treatments", label: "Treatments & Therapies", to: "/treatments-therapies",
    children: [
      { labelKey: "nav.subMassage", label: "Massage Therapy", to: "/treatments-therapies?category=Massage Therapy" },
      { labelKey: "nav.subHolistic", label: "Holistic Therapies", to: "/treatments-therapies?category=Holistic Therapy" },
      { labelKey: "nav.subFacialsBody", label: "Facials & Body Treatments", to: "/treatments-therapies?category=Organic Facials" },
      { labelKey: "nav.subWellnessPackages", label: "Wellness Packages", to: "/treatments-therapies?category=Spa Packages" },
      { labelKey: "nav.subSignature", label: "Signature Experiences", to: "/signature-treatments" },
    ],
  },
  {
    labelKey: "nav.classes", label: "Classes", to: "/classes",
    children: [
      { labelKey: "nav.subSchedule", label: "Class Schedule", to: "/classes/schedule" },
      { labelKey: "nav.subPrivate", label: "Private Classes", to: "/private-sessions" },
      { labelKey: "nav.subPasses", label: "Passes & Memberships", to: "/classes#buy" },
      { labelKey: "nav.subTraining", label: "Professional Training & Workshops", to: "/education" },
      { labelKey: "nav.subKinesiology", label: "Integrative Kinesiology Course", to: "/integrative-kinesiology-course" },
      { labelKey: "nav.subRental", label: "Studio Rental", to: "/studio-rental" },
    ],
  },
  {
    labelKey: "nav.retreats", label: "Retreats", to: "/retreats",
    children: [
      { labelKey: "nav.subPersonalRetreats", label: "Personal Wellness Retreats", to: "/retreats?tab=retreats" },
      { labelKey: "nav.subDayRetreats", label: "Day Retreats", to: "/day-retreats" },
      { labelKey: "nav.subGroupRetreat", label: "Plan a Group Retreat", to: "/custom-retreat" },
      { labelKey: "nav.subInquiry", label: "Retreat Inquiry", to: "/custom-retreat" },
    ],
  },
  {
    labelKey: "nav.about", label: "About", to: "/about",
    children: [
      { labelKey: "nav.subOurStory", label: "Our Story", to: "/about#story" },
      { labelKey: "nav.subEvelina", label: "Evelina Bolognini", to: "/about#founder" },
      { labelKey: "nav.subTeam", label: "Our Team", to: "/about#team" },
      { labelKey: "nav.subContact", label: "Location & Contact", to: "/contact" },
      { labelKey: "nav.blog", label: "Blog", to: "/blog" },
      { labelKey: "nav.faqs", label: "FAQs", to: "/faqs" },
    ],
  },
  { labelKey: "nav.giftCards", label: "Gift Cards", to: "/gift-cards" },
  { labelKey: "nav.book", label: "Book Now", to: "/book", cta: true },
];

export function Navbar() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [openMenu, setOpenMenu] = useState<string | null>(null); // desktop dropdown key
  const [openAccordion, setOpenAccordion] = useState<string | null>(null); // mobile accordion key
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: siteContent } = useSiteContent();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);

  const nav = siteContent?.nav || defaults.nav;
  // Admin-editable menu from the DB; falls back to the built-in MENU below.
  const dbMenu = useNavMenu();
  const menu: NavEntry[] = (dbMenu as NavEntry[] | null) ?? MENU;
  const lp = (path: string) => withLangPrefix(path, language);
  const label = (item: NavItem) => (item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus management for the mobile drawer.
  useEffect(() => {
    if (open) drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    else triggerRef.current?.focus();
  }, [open]);

  // Desktop dropdowns: Escape closes; click outside closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    const onClick = (e: MouseEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  // Close menus on route change.
  useEffect(() => { setOpenMenu(null); setOpen(false); setOpenAccordion(null); }, [location.pathname, location.hash, location.search]);

  const isActive = (to: string) => {
    const base = to.split(/[?#]/)[0];
    return location.pathname === lp(base) || location.pathname === base;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 gap-2">
        <Link to={lp("/")} className="flex items-center gap-2 shrink-0">
          <img src={holisLogo} alt="Holis Wellness Center" className="h-14 w-auto" />
        </Link>

        {/* Desktop */}
        <div ref={desktopNavRef} className="hidden lg:flex items-center gap-5 xl:gap-6">
          {menu.map((entry) => {
            if (!entry.children) {
              if (entry.cta) {
                return (
                  <Button key={entry.to} variant="default" size="sm" asChild>
                    <Link to={lp(entry.to)}>{label(entry)}</Link>
                  </Button>
                );
              }
              return (
                <Link
                  key={entry.to}
                  to={lp(entry.to)}
                  className={`text-sm font-body font-medium transition-colors hover:text-foreground ${isActive(entry.to) ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {label(entry)}
                </Link>
              );
            }
            const isOpen = openMenu === entry.to;
            const panelId = `menu-${entry.to.replace(/\W+/g, "-")}`;
            return (
              <div
                key={entry.to}
                className="relative"
                onMouseEnter={() => setOpenMenu(entry.to)}
                onMouseLeave={() => setOpenMenu((cur) => (cur === entry.to ? null : cur))}
              >
                <div className="flex items-center gap-0.5">
                  <Link
                    to={lp(entry.to)}
                    className={`text-sm font-body font-medium transition-colors hover:text-foreground ${isActive(entry.to) ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {label(entry)}
                  </Link>
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={label(entry)}
                    onClick={() => setOpenMenu(isOpen ? null : entry.to)}
                    className="inline-flex items-center justify-center h-6 w-5 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-2 min-w-[240px] rounded-xl border border-border bg-background shadow-lg p-1.5"
                    >
                      <ul>
                        {entry.children.map((child) => (
                          <li key={child.to + child.label}>
                            <Link
                              to={lp(child.to)}
                              onClick={() => setOpenMenu(null)}
                              className="block rounded-lg px-3 py-2 text-sm font-body text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                            >
                              {label(child)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          <LanguageToggle />
          {user ? (
            <div className="flex items-center gap-3">
              <Link to={lp("/dashboard")} className="text-sm font-body font-medium text-muted-foreground hover:text-foreground">
                {t("nav.myAccount", { defaultValue: nav.myAccountLabel })}
              </Link>
              <Button variant="ghost" size="sm" onClick={() => signOut()} aria-label={t("nav.signOut")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link to={lp("/auth")}>{t("nav.signIn", { defaultValue: nav.signInLabel })}</Link>
            </Button>
          )}
        </div>

        {/* Mobile trigger */}
        <div className="lg:hidden flex items-center gap-1">
          <LanguageToggle compact />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="mobile-drawer"
            aria-haspopup="dialog"
            aria-label={open ? t("nav.closeMenu", { defaultValue: "Close menu" }) : t("nav.openMenu", { defaultValue: "Open menu" })}
            className="inline-flex items-center justify-center rounded-md h-9 w-9 min-h-11 min-w-11 text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={drawerRef}
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.mobileNavigation", { defaultValue: "Mobile navigation" })}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-background border-b border-border max-h-[85vh] overflow-y-auto"
          >
            <nav aria-label={t("nav.mobileNavigation", { defaultValue: "Mobile" })} className="px-4 py-4">
              <ul className="space-y-1">
                {menu.map((entry) => {
                  if (!entry.children) {
                    if (entry.cta) {
                      return (
                        <li key={entry.to} className="pt-2">
                          <Button variant="default" size="sm" className="w-full" asChild>
                            <Link to={lp(entry.to)} onClick={() => setOpen(false)}>{label(entry)}</Link>
                          </Button>
                        </li>
                      );
                    }
                    return (
                      <li key={entry.to}>
                        <Link
                          to={lp(entry.to)}
                          onClick={() => setOpen(false)}
                          className="block py-2.5 text-sm font-body font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          {label(entry)}
                        </Link>
                      </li>
                    );
                  }
                  const expanded = openAccordion === entry.to;
                  const subId = `acc-${entry.to.replace(/\W+/g, "-")}`;
                  return (
                    <li key={entry.to} className="border-b border-border/50 last:border-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={subId}
                        onClick={() => setOpenAccordion(expanded ? null : entry.to)}
                        className="w-full flex items-center justify-between py-2.5 text-sm font-body font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        <span>{label(entry)}</span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.ul
                            id={subId}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden pl-3 pb-1"
                          >
                            <li>
                              <Link
                                to={lp(entry.to)}
                                onClick={() => setOpen(false)}
                                className="block py-2 text-[13px] font-body text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                              >
                                {t("nav.viewAll", { defaultValue: "View all" })}
                              </Link>
                            </li>
                            {entry.children.map((child) => (
                              <li key={child.to + child.label}>
                                <Link
                                  to={lp(child.to)}
                                  onClick={() => setOpen(false)}
                                  className="block py-2 text-[13px] font-body text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                >
                                  {label(child)}
                                </Link>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}

                {user ? (
                  <>
                    <li className="pt-2">
                      <Link to={lp("/dashboard")} onClick={() => setOpen(false)} className="block py-2.5 text-sm font-body font-medium text-foreground hover:text-primary rounded">{t("nav.myAccount", { defaultValue: nav.myAccountLabel })}</Link>
                    </li>
                    <li>
                      <Button variant="ghost" size="sm" className="w-full justify-start px-0 font-body font-medium" onClick={() => { signOut(); setOpen(false); }}>{t("nav.signOut", { defaultValue: nav.signOutLabel })}</Button>
                    </li>
                  </>
                ) : (
                  <li className="pt-2">
                    <Button variant="ghost" size="sm" className="w-full justify-start px-0" asChild>
                      <Link to={lp("/auth")} onClick={() => setOpen(false)}>{t("nav.signIn", { defaultValue: nav.signInLabel })}</Link>
                    </Button>
                  </li>
                )}
              </ul>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
