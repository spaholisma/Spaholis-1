import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Mail, Sparkles, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { initials, type PrivateKind } from "@/lib/privateClassRequest";
import { offeringPrice, sameName, usePrivateOfferings, type PrivateOffering } from "@/lib/privateOfferings";

function Face({ name, photo }: { name: string | null; photo: string | null }) {
  if (photo) return <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-background" />;
  return (
    <span className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-body text-xs font-semibold ring-2 ring-background",
      name ? "bg-spa-sage/25 text-spa-sage" : "bg-muted text-muted-foreground",
    )}>
      {name ? initials(name) : <Sparkles className="h-4 w-4" />}
    </span>
  );
}

function Row({ title, subtitle, name, photo }: { title: string; subtitle: string; name: string | null; photo: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Face name={name} photo={photo} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate font-body text-sm font-medium text-foreground">{title}</span>
        <span className="truncate font-body text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </span>
  );
}

/**
 * "Choose a class & teacher" for a private class request. Optional: the
 * default is "No specific class". The list is the teachers' own private
 * classes (each teacher sets hers, with her prices, in her Teacher Panel) —
 * only the ones offered for this kind of private class and this many people,
 * each with her price.
 *
 * A plain scrolling list rather than a Select: the wheel, the trackpad and a
 * finger then move it like the rest of the page, instead of the step-by-step
 * arrows a Select brings.
 */
export function PrivateClassPicker({
  kind,
  people,
  value,
  onChange,
  preselect,
}: {
  kind: PrivateKind;
  people: number;
  value: PrivateOffering | null;
  onChange: (offering: PrivateOffering | null) => void;
  /** Chosen on the way in — from a teacher's class page. Applied once. */
  preselect?: { offeringId?: string | null; classId?: string | null; teacherName?: string | null } | null;
}) {
  const { t } = useTranslation();
  const { data: all, isLoading } = usePrivateOfferings();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const priceOf = (o: PrivateOffering) => offeringPrice(o, kind, people);
  const options = useMemo(
    () => (isLoading ? null : (all ?? []).filter((o) => priceOf(o) != null)),
    [all, isLoading, kind, people], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Arriving from a teacher's page: her private class is already chosen, and
  // the guest can still change it. A teacher who is not found picks nothing,
  // so a request never goes to somebody else by accident.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !options || !preselect) return;
    preselected.current = true;
    if (value) return;
    const o = preselect.offeringId
      ? options.find((x) => x.id === preselect.offeringId)
      : preselect.classId && preselect.teacherName
        ? options.find((x) => x.class_id === preselect.classId && sameName(x.teacher_name, preselect.teacherName))
        : undefined;
    if (o) onChange(o);
  }, [options, preselect]); // eslint-disable-line react-hooks/exhaustive-deps

  const noClassTitle = t("consultation.privateNoClass", { defaultValue: "No specific class" });
  const noClassHint = t("consultation.privateNoClassHint", { defaultValue: "We'll help you choose" });
  const line = (o: PrivateOffering) => {
    const price = priceOf(o);
    const who = t("consultation.privateWith", { name: o.teacher_name, defaultValue: "with {{name}}" });
    return price == null ? who : `${who} · ${formatCRCWithUsd(price * USD_RATE)}`;
  };

  const pick = (option: PrivateOffering | null) => {
    onChange(option);
    setOpen(false);
  };

  const itemClass = (selected: boolean) =>
    cn(
      "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-spa-sage/10",
      selected && "bg-spa-sage/15",
    );

  return (
    <div className="relative overflow-hidden rounded-3xl border border-spa-sage/30 bg-gradient-to-br from-spa-sage/15 via-background to-background p-5 sm:p-6 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-spa-sage/20 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />

      <div className="relative space-y-1.5">
        <p className="flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-[0.22em] text-spa-sage">
          <Sparkles className="h-3.5 w-3.5" /> {t("consultation.privateEyebrow", { defaultValue: "Make it yours" })}
        </p>
        <h2 className="font-heading text-xl sm:text-2xl font-light text-foreground">
          {t("consultation.privatePickTitle", { defaultValue: "Choose a class & teacher" })}
        </h2>
        <p className="font-body text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {t("consultation.privatePickSubtitle", { defaultValue: "Optional — pick a class you love and your request goes straight to its teacher." })}
        </p>
      </div>

      <div className="relative mt-4">
        {options === null ? (
          <Skeleton className="h-16 w-full rounded-2xl" />
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-label={t("consultation.privatePickTitle", { defaultValue: "Choose a class & teacher" })}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-spa-sage/40 bg-background/90 px-3 py-2.5 text-left shadow-sm backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-spa-sage"
              >
                {value
                  ? <Row title={value.title} subtitle={line(value)} name={value.teacher_name} photo={value.teacher_photo} />
                  : <Row title={noClassTitle} subtitle={noClassHint} name={null} photo={null} />}
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[var(--radix-popover-trigger-width)] rounded-2xl p-1.5"
              onOpenAutoFocus={(e) => {
                // Keep the page still; the list is scrolled, not focused into.
                e.preventDefault();
                listRef.current?.focus({ preventScroll: true });
              }}
            >
              {/* Plain scrolling: wheel, trackpad and finger all behave normally. */}
              <div
                ref={listRef}
                role="listbox"
                tabIndex={-1}
                className="max-h-[19rem] space-y-1 overflow-y-auto overscroll-contain pr-0.5 outline-none"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  onClick={() => pick(null)}
                  className={itemClass(value === null)}
                >
                  <Row title={noClassTitle} subtitle={noClassHint} name={null} photo={null} />
                  {value === null && <Check className="h-4 w-4 shrink-0 text-spa-sage" />}
                </button>
                {options.map((o) => {
                  const selected = value?.id === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(o)}
                      className={itemClass(selected)}
                    >
                      <Row title={o.title} subtitle={line(o)} name={o.teacher_name} photo={o.teacher_photo} />
                      {selected && <Check className="h-4 w-4 shrink-0 text-spa-sage" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <p className="relative mt-3 flex items-start gap-2 font-body text-xs text-muted-foreground">
        {value ? (
          <>
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spa-sage" />
            <span>{t("consultation.privateGoesTo", { name: value.teacher_name, defaultValue: "Your request goes straight to {{name}} and the Holis team." })}</span>
          </>
        ) : (
          <>
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spa-sage" />
            <span>{t("consultation.privateGoesToTeam", { defaultValue: "Our team will help you find the right class and teacher." })}</span>
          </>
        )}
      </p>
    </div>
  );
}
