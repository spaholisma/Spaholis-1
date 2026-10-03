import { ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The button to a teacher's own BAC CompraClick payment page. CompraClick is a
 * hosted BAC page, so this only sends the student there — in a new tab, so
 * the booking confirmation stays open behind it.
 */
export function CompraClickButton({
  href, label = "Pay with CompraClick", className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3",
        "bg-[#c8102e] text-white font-body text-sm font-semibold shadow-sm",
        "transition-all hover:bg-[#a50d26] active:scale-[0.98] active:duration-75",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e] focus-visible:ring-offset-2",
        className,
      )}
    >
      <Lock className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
      <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
    </a>
  );
}
