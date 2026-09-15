import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRows } from "@/lib/localizeRow";
import { cn } from "@/lib/utils";
import { buildClassOptions, initials, NO_CLASS, type PrivateClassOption } from "@/lib/privateClassRequest";

function Face({ name, photo, className }: { name: string | null; photo: string | null; className?: string }) {
  if (photo) return <img src={photo} alt="" className={cn("h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-background", className)} />;
  return (
    <span className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-body text-xs font-semibold ring-2 ring-background",
      name ? "bg-spa-sage/25 text-spa-sage" : "bg-muted text-muted-foreground",
      className,
    )}>
      {name ? initials(name) : <Sparkles className="h-4 w-4" />}
    </span>
  );
}

/**
 * "Choose a class & teacher" for a private class request. Optional: the
 * default is "No specific class". Options come from the active classes and
 * the teachers named on their sessions.
 */
export function PrivateClassPicker({
  value,
  onChange,
}: {
  value: PrivateClassOption | null;
  onChange: (option: PrivateClassOption | null) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [options, setOptions] = useState<PrivateClassOption[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const until = new Date(Date.now() + 120 * 86_400_000).toISOString();
      const [{ data: classes }, { data: sessions }, { data: teachers }] = await Promise.all([
        supabase.from("classes").select("id, title, title_es, category, instructor, image_url").eq("is_active", true).order("title"),
        supabase.from("class_schedule").select("class_id, instructor").eq("is_cancelled", false).gte("start_time", since).lte("start_time", until).limit(2000),
        (supabase as any).rpc("public_teachers"),
      ]);
      if (!alive) return;
      const localized = localizeRows(((classes as any[]) ?? []), language, ["title"]);
      setOptions(buildClassOptions(localized as any, (sessions as any[]) ?? [], (teachers as any[]) ?? []));
    })().catch(() => alive && setOptions([]));
    return () => { alive = false; };
  }, [language]);

  const teacherLine = (o: PrivateClassOption) =>
    o.teacherName
      ? t("consultation.privateWith", { name: o.teacherName, defaultValue: "with {{name}}" })
      : t("consultation.privateTeacherTbc", { defaultValue: "Teacher to be confirmed" });

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
          <Select
            value={value?.key ?? NO_CLASS}
            onValueChange={(k) => onChange(k === NO_CLASS ? null : options.find((o) => o.key === k) ?? null)}
          >
            <SelectTrigger
              aria-label={t("consultation.privatePickTitle", { defaultValue: "Choose a class & teacher" })}
              className="h-auto min-h-[68px] rounded-2xl border-spa-sage/40 bg-background/90 px-3 py-2.5 text-left shadow-sm backdrop-blur focus:ring-spa-sage [&>span]:w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80 rounded-2xl">
              <SelectItem value={NO_CLASS} className="rounded-xl py-2.5">
                <span className="flex items-center gap-3">
                  <Face name={null} photo={null} />
                  <span className="flex flex-col text-left">
                    <span className="font-body text-sm font-medium text-foreground">{t("consultation.privateNoClass", { defaultValue: "No specific class" })}</span>
                    <span className="font-body text-xs text-muted-foreground">{t("consultation.privateNoClassHint", { defaultValue: "We'll help you choose" })}</span>
                  </span>
                </span>
              </SelectItem>
              {options.map((o) => (
                <SelectItem key={o.key} value={o.key} className="rounded-xl py-2.5">
                  <span className="flex items-center gap-3">
                    <Face name={o.teacherName} photo={o.teacherPhoto} />
                    <span className="flex flex-col text-left">
                      <span className="font-body text-sm font-medium text-foreground">{o.classTitle}</span>
                      <span className="font-body text-xs text-muted-foreground">{teacherLine(o)}</span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
