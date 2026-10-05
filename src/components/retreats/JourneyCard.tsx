import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform,
} from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface JourneyChip { icon: LucideIcon; text: string }

/**
 * One retreat, package or experience on the Retreats page.
 *
 * It answers the hand: on a computer the card leans toward the cursor with a
 * soft light where it points, the photo drifts closer and a "Details" arrow
 * slides in. Phones (and anyone who asked for less motion) get a calm card
 * that works by tapping.
 */
export function JourneyCard({
  image, title, description, chips, price, priceNote, cta, href, onOpen, index = 0, wide = false,
}: {
  image: string | null;
  title: string;
  description: string | null;
  chips: JourneyChip[];
  price: ReactNode;
  priceNote?: string;
  /** The button: where it goes and what it says. */
  cta: { label: string; to: string };
  /** The whole card goes here (retreats have their own page)… */
  href?: string;
  /** …or opens the details window (packages and experiences). */
  onOpen?: () => void;
  index?: number;
  /** Bigger text and photo, for the two-column retreats grid. */
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [5, -5]), { stiffness: 220, damping: 22 });
  const ry = useSpring(useTransform(px, [0, 1], [-6, 6]), { stiffness: 220, damping: 22 });
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(520px circle at ${gx} ${gy}, rgba(255,255,255,0.22), transparent 55%)`;

  const fine = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
  const tilt = fine && !reduce;

  const onMove = (e: React.PointerEvent) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => { px.set(0.5); py.set(0.5); };

  const body = (
    <>
      {/* Photo, with the facts floating on it */}
      <div className={cn("relative overflow-hidden", wide ? "aspect-[16/10]" : "aspect-[4/3]")}>
        <img
          src={image || "/class-placeholder.jpg"}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
        <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1.5 font-heading text-sm font-semibold text-foreground shadow-sm backdrop-blur">
          {price}
          {priceNote && <span className="ml-1 font-body text-[11px] font-normal text-muted-foreground">{priceNote}</span>}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
          {chips.map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 font-body text-[11px] font-medium text-white backdrop-blur-md">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {text}
            </span>
          ))}
        </div>
      </div>

      <div className={cn("flex flex-1 flex-col p-5", wide && "sm:p-6")}>
        <h2 className={cn(
          "font-heading font-medium text-foreground transition-colors duration-300 group-hover:text-spa-sage",
          wide ? "text-2xl" : "text-xl",
        )}>
          {title}
        </h2>
        {description && (
          <p className="spa-body-sm mt-2 line-clamp-3 flex-1">{description}</p>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
            Details
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </span>
          <Button size="sm" className="rounded-full px-5" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Link to={cta.to}>{cta.label}</Link>
          </Button>
        </div>
      </div>

      {/* The light that follows the cursor */}
      {tilt && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: glare }}
        />
      )}
    </>
  );

  const shell = cn(
    "group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left",
    "transition-[box-shadow,border-color] duration-500",
    "hover:border-spa-sage/50 hover:shadow-[0_30px_70px_-35px_hsl(var(--spa-sage)/0.8)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.08, 0.4), ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1000 }}
      className="h-full"
    >
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={tilt ? { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" } : undefined}
        whileHover={reduce ? undefined : { y: -6 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="h-full"
      >
        {href ? (
          <Link to={href} className={shell}>{body}</Link>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
            aria-label={`${title} — details`}
            className={cn(shell, "cursor-pointer")}
          >
            {body}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
