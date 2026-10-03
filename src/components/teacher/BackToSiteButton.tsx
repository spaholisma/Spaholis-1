import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import holisLogo from "@/assets/holis-logo-clean.png";
import { cn } from "@/lib/utils";

/**
 * The Teacher Panel has no site navbar — it is her workspace — so this is the
 * way back to spaholis.com: the Holis mark in a soft circle, a label, and an
 * arrow that leans home on hover.
 */
export function BackToSiteButton({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      <Link
        to="/"
        aria-label="Back to the Holis website"
        className={cn(
          "group relative inline-flex items-center gap-3 rounded-full border border-border bg-card/90 py-1.5 pl-1.5 pr-5",
          "shadow-[0_8px_24px_-16px_rgba(0,0,0,0.35)] backdrop-blur transition-all duration-300",
          "hover:-translate-y-0.5 hover:border-spa-sage/60 hover:shadow-[0_14px_34px_-16px_hsl(var(--spa-sage)/0.7)]",
          "active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-spa-sage/15">
          {/* A sage wash fills the circle from the left on hover. */}
          <span className="absolute inset-0 -translate-x-full rounded-full bg-spa-sage transition-transform duration-500 ease-out group-hover:translate-x-0" />
          <ArrowLeft className="relative h-4 w-4 text-spa-sage transition-all duration-300 group-hover:-translate-x-0.5 group-hover:text-white" />
        </span>
        <img
          src={holisLogo} alt="" aria-hidden="true"
          className="h-9 w-auto transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-105"
        />
        <span className="flex flex-col leading-tight">
          <span className="font-body text-sm font-semibold text-foreground">Back to Holis</span>
          <span className="font-body text-[11px] text-muted-foreground">spaholis.com</span>
        </span>
      </Link>
    </motion.div>
  );
}
