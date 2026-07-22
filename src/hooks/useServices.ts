import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRows } from "@/lib/localizeRow";

export interface ServiceRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  type: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  capacity: number | null;
  sessions: number;
  level: number | null;
  is_online: boolean;
  meeting_url: string | null;
  certificate: boolean;
  max_participants: number | null;
  requires_payment: boolean;
  /** Add-on extra (attaches to a treatment); excluded from the normal list. */
  is_addon: boolean;
}

const SERVICE_I18N_FIELDS = ["title", "description", "description_rich", "gallery_images"];

export function useServices() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["services", language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .eq("is_addon", false)
        .order("sort_order");
      if (error) throw error;
      return localizeRows(data as any[], language, SERVICE_I18N_FIELDS) as ServiceRow[];
    },
  });
}

/** Add-on extras (attach to a treatment) — kept out of useServices so they
 *  never show as standalone bookable services. */
export function useAddonServices() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["addon-services", language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .eq("is_addon", true)
        .order("sort_order");
      if (error) throw error;
      return localizeRows(data as any[], language, SERVICE_I18N_FIELDS) as ServiceRow[];
    },
  });
}

export function useServicesByCategory() {
  const query = useServices();
  const grouped = (query.data ?? []).reduce<Record<string, ServiceRow[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});
  return { ...query, grouped };
}

export function useServicesByType(type: string) {
  const query = useServices();
  const filtered = (query.data ?? []).filter((s) => s.type === type);
  return { ...query, data: filtered };
}
