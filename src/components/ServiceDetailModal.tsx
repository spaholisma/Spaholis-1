import { Link } from "react-router-dom";
import { formatCRCWithUsd } from "@/lib/currency";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Users, CalendarDays, MapPin, CheckCircle2 } from "lucide-react";
import type { ServiceRow } from "@/hooks/useServices";

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
  if (!service) return null;

  const { main, includes } = extractIncludes(service.description);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Image */}
        {service.image_url && (
          <div className="aspect-[16/9] w-full overflow-hidden">
            <img
              src={service.image_url}
              alt={service.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-body font-semibold uppercase tracking-wider text-muted-foreground">
                {service.category}
              </span>
              {service.type && service.type !== "treatment" && (
                <span className="text-[10px] font-body font-semibold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {service.type}
                </span>
              )}
            </div>
            <DialogTitle className="font-heading text-2xl font-medium text-foreground whitespace-pre-line">
              {service.title}
            </DialogTitle>
          </div>

          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-3 text-sm font-body text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {durationLabel(service.duration_minutes)}
            </span>
            {service.capacity && service.capacity > 1 && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Up to {service.capacity} people
              </span>
            )}
            {service.sessions > 1 && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {service.sessions} sessions
              </span>
            )}
            {(service.type === "experience" || service.type === "program") && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                Manuel Antonio, Costa Rica
              </span>
            )}
          </div>

          {/* Full Description */}
          <div className="space-y-3">
            <p className="font-body text-base text-foreground/90 leading-relaxed whitespace-pre-line">
              {main}
            </p>
          </div>

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

          {/* Price & CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <p className="font-heading text-2xl font-semibold text-foreground">
                {formatCRCWithUsd(service.price)}
              </p>
              {service.type === "experience" && (
                <p className="text-xs font-body text-muted-foreground">per person · tax included</p>
              )}
              {service.type !== "experience" && (
                <p className="text-xs font-body text-muted-foreground">tax included</p>
              )}
            </div>
            <Button variant="default" size="lg" asChild>
              <Link
                to={ctaHref(service)}
                onClick={() => onOpenChange(false)}
              >
                {ctaLabel(service)}
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
