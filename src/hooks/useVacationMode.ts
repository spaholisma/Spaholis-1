import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VacationMode {
  enabled: boolean;
  start_date: string | null;
  end_date: string | null;
  heading: string;
  message: string;
  whatsapp_number: string | null;
  hide_form: boolean;
}

/** Today's date in Costa Rica as YYYY-MM-DD. */
function todayCR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
}

/**
 * Vacation Mode is "active" when it's enabled AND today (spa timezone) falls
 * within the start/end window. Once the end date passes — or the toggle is
 * turned off — the booking form reactivates automatically.
 */
export function useVacationMode() {
  const query = useQuery({
    queryKey: ["vacation-mode"],
    queryFn: async (): Promise<VacationMode | null> => {
      const { data, error } = await (supabase.from("vacation_mode" as any) as any)
        .select("enabled, start_date, end_date, heading, message, whatsapp_number, hide_form")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as VacationMode) ?? null;
    },
    staleTime: 60_000,
  });

  const v = query.data;
  const today = todayCR();
  // "Active" = today is within the vacation window (whole booking system paused).
  const isActive = !!v?.enabled
    && (!v.start_date || today >= v.start_date)
    && (!v.end_date || today <= v.end_date);

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Is a specific (future or current) calendar date inside the vacation range?
  // Used to block those dates in the booking calendar even before vacation starts.
  const isVacationDate = (d: Date): boolean => {
    if (!v?.enabled) return false;
    const s = ymd(d);
    return (!v.start_date || s >= v.start_date) && (!v.end_date || s <= v.end_date);
  };

  return { ...query, vacation: v, isActive, isVacationDate };
}
