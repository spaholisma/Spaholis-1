import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { validateWhatsAppLink } from "@/lib/whatsapp";
import { stripLangPrefix } from "@/i18n/LanguageProvider";

export function WhatsAppButton() {
  const { data: content } = useSiteContent();
  const c = (content || defaults) as typeof defaults;
  const wa = c.whatsapp;
  const { pathname } = useLocation();

  // Hidden on the /go partner links: that page opens WhatsApp itself, with its own message.
  if (!wa?.enabled || pathname.startsWith("/admin") || stripLangPrefix(pathname).startsWith("/go/")) return null;

  const { url, valid } = validateWhatsAppLink(wa?.link);
  if (!valid && typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[WhatsApp] CMS link "${wa.link}" does not match canonical number. Falling back to canonical URL.`
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={wa?.text || "Chat on WhatsApp"}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg transition-all",
        // Clear of the iPhone home indicator, which sits over the bottom strip.
        "[bottom:calc(1.5rem+env(safe-area-inset-bottom))]",
        "bg-[#25D366] text-white hover:bg-[#1ebe57] hover:shadow-xl hover:scale-105",
        "group"
      )}
    >
      <MessageCircle className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium hidden sm:inline">{wa?.text || "Chat on WhatsApp"}</span>
    </a>
  );
}
