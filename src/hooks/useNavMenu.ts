import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageProvider";

export interface NavRow {
  id: string;
  parent_id: string | null;
  label_en: string;
  label_es: string | null;
  href: string;
  sort_order: number;
  is_visible: boolean;
  is_cta: boolean;
}

export interface MenuNode {
  label: string;
  to: string;
  cta?: boolean;
  children?: MenuNode[];
}

/**
 * Admin-editable navigation menu (public.nav_items). Returns the menu tree in
 * the current language, or `null` when the table is empty/unavailable — the
 * Navbar then falls back to its built-in menu, so nav never breaks.
 */
export function useNavMenu(): MenuNode[] | null {
  const { language } = useLanguage();
  const { data } = useQuery({
    queryKey: ["nav-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nav_items" as any).select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as NavRow[];
    },
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;
  const lbl = (r: NavRow) => (language === "es" ? (r.label_es || r.label_en) : r.label_en);
  const tops = data.filter((r) => !r.parent_id && r.is_visible).sort((a, b) => a.sort_order - b.sort_order);
  return tops.map((t) => {
    const kids = data
      .filter((r) => r.parent_id === t.id && r.is_visible)
      .sort((a, b) => a.sort_order - b.sort_order);
    const node: MenuNode = { label: lbl(t), to: t.href, cta: t.is_cta };
    if (kids.length) node.children = kids.map((k) => ({ label: lbl(k), to: k.href }));
    return node;
  });
}
