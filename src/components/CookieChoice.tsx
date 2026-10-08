import { useEffect, useState } from "react";
import { getConsent, onConsentChange, setConsent, type Consent } from "@/lib/analytics";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** The visitor's analytics choice, shown and changeable on the privacy page. */
export function CookieChoice() {
  const { language } = useLanguage();
  const es = language === "es";
  const [choice, setChoice] = useState<Consent | null>(() => getConsent());
  useEffect(() => onConsentChange(setChoice), []);

  const label = choice === "granted"
    ? (es ? "Ha aceptado las cookies de análisis." : "You have accepted analytics cookies.")
    : choice === "denied"
      ? (es ? "Ha rechazado las cookies de análisis." : "You have declined analytics cookies.")
      : (es ? "Todavía no ha elegido." : "You have not chosen yet.");

  const btn = "min-h-11 rounded-full px-4 py-2.5 font-body text-sm font-medium transition-colors";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="font-body text-sm text-foreground" aria-live="polite">{label}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConsent("denied")}
          className={cn(btn, "border border-border hover:bg-muted", choice === "denied" && "bg-muted")}>
          {es ? "Rechazar" : "Decline"}
        </button>
        <button type="button" onClick={() => setConsent("granted")}
          className={cn(btn, "bg-foreground text-background hover:opacity-90", choice === "granted" && "opacity-80")}>
          {es ? "Aceptar" : "Accept"}
        </button>
      </div>
    </div>
  );
}
