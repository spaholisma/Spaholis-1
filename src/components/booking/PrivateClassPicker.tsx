import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Mail, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeekEvents } from "@/hooks/useClasses";
import { cn } from "@/lib/utils";
import { buildClassOptions, initials, type PrivateClassOption, type SessionWithClass, type TeacherRow } from "@/lib/privateClassRequest";

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
 * default is "No specific class". The list is built from the scheduled
 * sessions — the same classes the Classes page shows — with the teacher who
 * has been giving each one.
 *
 * A plain scrolling list rather than a Select: the wheel, the trackpad and a
 * finger then move it like the rest of the page, instead of the step-by-step
 * arrows a Select brings.
 */
export function PrivateClassPicker({
  value,
  onChange,
}: {
  value: PrivateClassOption | null;
  onChange: (option: PrivateClassOption | null) => void;
}) {
  const { t } = useTranslation();
  // The classes we are actually teaching: the scheduled sessions, exactly what
  // the Classes page lists. Anything not running is never offered here.
  const { data: sessions, isLoading } = useWeekEvents();
  const [teachers, setTeachers] = useState<TeacherRow[] | null>(null);
  // Upcoming sessions often have no teacher on them yet, so who has been
  // giving each class recently fills that in.
  const [recent, setRecent] = useState<SessionWithClass[] | null>(null);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    // 60 days: the same window send-private-class-request checks a teacher against.
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    Promise.all([
      (supabase as any).rpc("public_teachers"),
      supabase.from("class_schedule").select("class_id, instructor").eq("is_cancelled", false)
        .gte("start_time", since).lte("start_time", new Date().toISOString())
        .not("instructor", "is", null).order("start_time", { ascending: false }).limit(500),
    ]).then(([t, r]: any[]) => {
      if (!alive) return;
      setTeachers((t?.data as TeacherRow[]) ?? []);
      setRecent(((r?.data as SessionWithClass[]) ?? []));
    });
    return () => { alive = false; };
  }, []);

  const options = useMemo(
    () => (isLoading || teachers === null || recent === null ? null : buildClassOptions((sessions ?? []) as any, teachers, recent)),
    [sessions, isLoading, teachers, recent],
  );

  const noClassTitle = t("consultation.privateNoClass", { defaultValue: "No specific class" });
  const noClassHint = t("consultation.privateNoClassHint", { defaultValue: "We'll help you choose" });
  const teacherLine = (o: PrivateClassOption) =>
    o.teacherName
      ? t("consultation.privateWith", { name: o.teacherName, defaultValue: "with {{name}}" })
      : t("consultation.privateTeacherTbc", { defaultValue: "Teacher to be confirmed" });

  const pick = (option: PrivateClassOption | null) => {
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
                  ? <Row title={value.classTitle} subtitle={teacherLine(value)} name={value.teacherName} photo={value.teacherPhoto} />
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
                  const selected = value?.key === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(o)}
                      className={itemClass(selected)}
                    >
                      <Row title={o.classTitle} subtitle={teacherLine(o)} name={o.teacherName} photo={o.teacherPhoto} />
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
        {value?.teacherName ? (
          <>
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spa-sage" />
            <span>{t("consultation.privateGoesTo", { name: value.teacherName, defaultValue: "Your request goes straight to {{name}} and the Holis team." })}</span>
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
