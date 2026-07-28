import { Palmtree, MessageCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { HOLIS_WHATSAPP_NUMBER } from "@/data/contact";
import type { VacationMode } from "@/hooks/useVacationMode";

/**
 * Elegant, on-brand vacation notice shown at the top of the booking page while
 * Vacation Mode is active. Not a popup — a clean card in the page flow.
 */
export function VacationNotice({ vacation }: { vacation: VacationMode }) {
  const digits = (vacation.whatsapp_number || HOLIS_WHATSAPP_NUMBER).replace(/[^\d]/g, "");
  const waMsg = encodeURIComponent(
    "Hi Holis! 🌿 I'd like to request an appointment during your vacation dates. Could you help me schedule one?",
  );
  const waUrl = `https://wa.me/${digits}?text=${waMsg}`;

  const range = vacation.start_date && vacation.end_date
    ? `${format(parseISO(vacation.start_date), "MMMM d")} – ${format(parseISO(vacation.end_date), "MMMM d, yyyy")}`
    : null;

  return (
    <div className="max-w-2xl mx-auto rounded-2xl border border-spa-sage/30 bg-spa-sage/5 overflow-hidden shadow-sm">
      <div className="bg-spa-sage/10 px-6 py-5 flex items-center gap-3 border-b border-spa-sage/20">
        <div className="h-11 w-11 rounded-full bg-spa-sage/20 flex items-center justify-center shrink-0">
          <Palmtree className="h-5 w-5 text-spa-sage" />
        </div>
        <div>
          <h2 className="font-heading text-xl md:text-2xl font-semibold text-foreground leading-tight">
            {vacation.heading || "We're Currently on Vacation"}
          </h2>
          {range && <p className="font-body text-sm text-spa-sage mt-0.5">{range}</p>}
        </div>
      </div>

      <div className="px-6 py-6">
        {vacation.message && (
          <p className="font-body text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
            {vacation.message}
          </p>
        )}

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-spa-sage text-white font-body font-semibold px-7 py-3.5 shadow-md hover:bg-spa-sage/90 transition-colors"
        >
          <MessageCircle className="h-5 w-5" />
          Text Us to Schedule
        </a>
      </div>
    </div>
  );
}
