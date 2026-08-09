import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRow, localizeRows } from "@/lib/localizeRow";

export interface ClassRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  location: string | null;
  instructor: string | null;
  is_active: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
  requires_payment: boolean;
  max_capacity: number;
  /** Custom display price (e.g. a colones amount) shown instead of the USD price. */
  price_label: string | null;
  /** Direct-to-teacher payment instructions (when not paid through the site). */
  payment_instructions: string | null;
  /** Feature this class prominently on the web until this timestamp. */
  featured_until: string | null;
}

export interface ScheduleRow {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  spots_remaining: number;
  is_cancelled: boolean;
  classes: ClassRow;
}

const CLASS_I18N_FIELDS = ["title", "description", "location", "instructor", "payment_instructions"];

export function useClasses() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["classes", language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("is_active", true)
        .order("title");
      if (error) throw error;
      return localizeRows(data as any[], language, CLASS_I18N_FIELDS) as ClassRow[];
    },
  });
}

export function useUpcomingEvents() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["upcoming-events", language],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("class_schedule")
        .select("*, classes(*)")
        .gte("start_time", now)
        .eq("is_cancelled", false)
        .order("start_time", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => s.classes?.is_active)
        .map((s: any) => ({
          ...s,
          classes: localizeRow(s.classes, language, CLASS_I18N_FIELDS),
        })) as ScheduleRow[];
    },
  });
}

export function useWeekEvents() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["week-events", language],
    queryFn: async () => {
      const { startOfWeek, addDays } = await import("date-fns");
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const rangeEnd = addDays(weekStart, 35); // 5 weeks
      const { data, error } = await supabase
        .from("class_schedule")
        .select("*, classes(*)")
        .gte("start_time", weekStart.toISOString())
        .lt("start_time", rangeEnd.toISOString())
        .eq("is_cancelled", false)
        .order("start_time", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => s.classes?.is_active)
        .map((s: any) => ({
          ...s,
          classes: localizeRow(s.classes, language, CLASS_I18N_FIELDS),
        })) as ScheduleRow[];
    },
  });
}
