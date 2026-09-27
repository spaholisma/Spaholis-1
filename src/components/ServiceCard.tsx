import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCRCWithUsd } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import type { ServiceRow } from "@/hooks/useServices";
import { ServiceDetailModal } from "@/components/ServiceDetailModal";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { pickLocalized } from "@/lib/i18n-field";
import { responsiveImage } from "@/lib/sizedImage";

export function ServiceCard({ service }: { service: ServiceRow }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { language } = useLanguage();

  const title = pickLocalized(service as unknown as Record<string, unknown>, "title", language) || service.title;
  const description = pickLocalized(service as unknown as Record<string, unknown>, "description", language) || service.description || "";

  const durationLabel = service.duration_minutes >= 60
    ? `${Math.floor(service.duration_minutes / 60)}h${service.duration_minutes % 60 ? ` ${service.duration_minutes % 60}min` : ""}`
    : `${service.duration_minutes} min`;

  const ctaLabel =
    service.type === "program"
      ? t("booking.confirm", { defaultValue: "Request Program" })
      : service.type === "experience"
      ? t("nav.book", { defaultValue: "Book Experience" })
      : t("nav.book", { defaultValue: "Book Now" });

  return (
    <>
      <div className="spa-card group cursor-pointer" onClick={() => setOpen(true)}>
        <div className="aspect-[4/3] overflow-hidden">
          <img
            {...responsiveImage(
              service.image_url || "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/558db4e1-a1f4-4c5a-be26-b98512dd6ddf/massage_page.jpg",
              "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
              1000,
            )}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-body font-semibold uppercase tracking-wider text-muted-foreground">
              {service.category}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground font-body">
              <Clock className="h-3 w-3" />
              {durationLabel}
            </div>
          </div>
          <h3 className="font-heading text-xl font-medium text-foreground whitespace-pre-line">{title}</h3>
          <p className="spa-body-sm line-clamp-2">{description}</p>
          <div className="flex items-center justify-between pt-2">
            <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(service.price)}</span>
            <Button variant="default" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Link to={withLangPrefix(`/book?service=${service.id}`, language)}>
                {ctaLabel}
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <ServiceDetailModal service={service} open={open} onOpenChange={setOpen} />
    </>
  );
}
