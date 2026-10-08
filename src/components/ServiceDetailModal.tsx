import { Fragment, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { formatCRCWithUsd } from "@/lib/currency";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Users, CalendarDays, MapPin, CheckCircle2 } from "lucide-react";
import type { ServiceRow } from "@/hooks/useServices";
import { descriptionBlocks, isStructured } from "@/lib/descriptionBlocks";
import { trackViewService } from "@/lib/analytics";

function durationLabel(mins: number) {
  if (mins >= 480) return "Full Day";
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m ? ` ${m}min` : ""}`;
  }
  return `${mins} min`;
}

function extractIncludes(desc: string | null): { main: string; includes: string[] } {
  if (!desc) return { main: "", includes: [] };
  const idx = desc.indexOf("Includes:");
  if (idx === -1) return { main: desc, includes: [] };
  const main = desc.slice(0, idx).trim();
  const rest = desc.slice(idx + "Includes:".length).trim();
  const items = rest
    .split(/[,.]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  return { main, includes: items };
}

function ctaLabel(service: ServiceRow) {
  if (service.request_only) return "Request Appointment";
  if (service.type === "program") return "Request Program";
  if (service.type === "experience") return "Book Experience";
  return "Book Now";
}

// Where the CTA goes. Request-only treatments (limited therapist availability)
// route to the request form instead of the online calendar.
function ctaHref(service: ServiceRow): string {
  if (service.request_only) {
    return `/book?service=consultation&topic=${encodeURIComponent(service.title)}`;
  }
  if (service.type === "experience") return `/experience-booking?experience=${service.id}`;
  return `/book?service=${service.id}`;
}

interface Props {
  service: ServiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceDetailModal({ service, open, onOpenChange }: Props) {
  const reduce = useReducedMotion();
  // Counted each time the window opens on a service.
  useEffect(() => {
    if (!open || !service) return;
    trackViewService({
      booking_type: service.type === "experience" ? "experience" : service.type === "program" ? "retreat" : "treatment",
      item_id: service.id, item_name: service.title, item_category: service.category, value: Number(service.price ?? 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id]);
  if (!service) return null;

  const { main, includes } = extractIncludes(service.description);
  const blocks = descriptionBlocks(main);
  const structured = isStructured(blocks);
  const features = blocks.filter((b) => b.kind === "feature");
  const fade = (i: number) => (reduce ? {} : {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: 0.08 + i * 0.06, ease: [0.16, 1, 0.3, 1] as const },
  });

  const chips = [
    { icon: Clock, text: durationLabel(service.duration_minutes) },
    ...(service.capacity && service.capacity > 1 ? [{ icon: Users, text: `Up to ${service.capacity} people` }] : []),
    ...(service.sessions > 1 ? [{ icon: CalendarDays, text: `${service.sessions} sessions` }] : []),
    ...(service.type === "experience" || service.type === "program"
      ? [{ icon: MapPin, text: "Manuel Antonio, Costa Rica" }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Photo, with the category resting on it */}
        {service.image_url ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <motion.img
              src={service.image_url}
              alt={service.title}
              className="w-full h-full object-cover"
              initial={reduce ? false : { scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="absolute left-6 sm:left-8 bottom-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-body font-semibold uppercase tracking-wider text-foreground">
                {service.category}
              </span>
            </div>
          </div>
        ) : null}

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <motion.div {...fade(0)}>
            {!service.image_url && (
              <span className="mb-2 inline-block text-xs font-body font-semibold uppercase tracking-wider text-muted-foreground">
                {service.category}
              </span>
            )}
            <DialogTitle className="font-heading text-2xl sm:text-3xl font-medium text-foreground whitespace-pre-line">
              {service.title}
            </DialogTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map(({ icon: Icon, text }) => (
                <span key={text} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-body text-foreground/80">
                  <Icon className="h-3.5 w-3.5 text-spa-sage" />
                  {text}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Description — laid out when it has highlights, plain text otherwise */}
          {structured ? (
            <div className="space-y-6">
              {blocks.map((b, i) => {
                if (b.kind === "lead") {
                  return (
                    <motion.p key={i} {...fade(1)} className="font-heading text-xl sm:text-2xl leading-snug text-foreground">
                      {b.text}
                    </motion.p>
                  );
                }
                if (b.kind === "para") {
                  return (
                    <motion.p key={i} {...fade(2)} className="font-body text-base text-foreground/80 leading-relaxed whitespace-pre-line">
                      {b.text}
                    </motion.p>
                  );
                }
                if (b.kind === "feature") {
                  // The highlights sit together in one grid, drawn at the first of them.
                  if (features[0] !== b) return null;
                  return (
                    <div key={i} className="grid gap-3 sm:grid-cols-2">
                      {features.map((f, j) => f.kind === "feature" && (
                        <motion.div
                          key={f.title}
                          {...fade(3 + j)}
                          className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-spa-sage/50"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-spa-sage/15 text-xl transition-transform group-hover:scale-110" aria-hidden="true">
                              {f.icon}
                            </span>
                            <h3 className="font-heading text-base font-medium text-foreground leading-tight">{f.title}</h3>
                          </div>
                          <p className="font-body text-sm text-muted-foreground leading-relaxed">{f.text}</p>
                        </motion.div>
                      ))}
                    </div>
                  );
                }
                if (b.kind === "tagline") {
                  return (
                    <motion.div key={i} {...fade(8)} className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-spa-sage/40" />
                      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-body text-xs font-semibold uppercase tracking-[0.25em] text-spa-sage">
                        {b.words.map((w, k) => (
                          <Fragment key={w}>
                            {k > 0 && <span className="h-1 w-1 rounded-full bg-spa-sage/60" aria-hidden="true" />}
                            <span>{w}</span>
                          </Fragment>
                        ))}
                      </p>
                      <span className="h-px flex-1 bg-spa-sage/40" />
                    </motion.div>
                  );
                }
                return (
                  <motion.div key={i} {...fade(9)} className="flex flex-wrap gap-2">
                    {b.items.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-spa-sage/10 px-3 py-1.5 font-body text-xs font-medium text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-spa-sage" />
                        {t}
                      </span>
                    ))}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-body text-base text-foreground/90 leading-relaxed whitespace-pre-line">
                {main}
              </p>
            </div>
          )}

          {/* Long-form rich description (What to Expect / Benefits) */}
          {(service as any).description_rich?.html && (
            <div
              className="prose prose-sm max-w-none font-body text-foreground/85 leading-relaxed
                         prose-headings:font-heading prose-headings:font-medium prose-headings:text-foreground
                         prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
                         prose-h4:text-sm prose-h4:uppercase prose-h4:tracking-wider prose-h4:text-muted-foreground
                         prose-ul:my-2 prose-li:my-0.5 prose-p:my-2"
              dangerouslySetInnerHTML={{ __html: (service as any).description_rich.html }}
            />
          )}

          {/* What's Included */}
          {includes.length > 0 && (
            <div className="bg-muted/50 rounded-xl p-5 space-y-3">
              <h3 className="font-heading text-base font-medium text-foreground">
                What's Included
              </h3>
              <ul className="space-y-2">
                {includes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 font-body text-sm text-foreground/80">
                    <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Price & CTA — stays in view while reading */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-6 sm:px-8 py-4 backdrop-blur">
          <div>
            <p className="font-heading text-2xl font-semibold text-foreground leading-none">
              {formatCRCWithUsd(service.price)}
            </p>
            <p className="mt-1 text-xs font-body text-muted-foreground">
              {service.type === "experience" ? "per person · tax included" : "tax included"}
            </p>
          </div>
          <Button variant="default" size="lg" className="rounded-full px-7" asChild>
            <Link
              to={ctaHref(service)}
              onClick={() => onOpenChange(false)}
            >
              {ctaLabel(service)}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
