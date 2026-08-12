import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, DEFAULT_THEME, type Theme } from "@/lib/theme";

/**
 * Loads the admin-defined theme (colors + roundness) from site_content and
 * applies it to :root at runtime. Renders nothing. Mounted once in App.
 */
export function ThemeApplier() {
  const { data } = useQuery({
    queryKey: ["site-theme"],
    queryFn: async (): Promise<Theme | null> => {
      const { data } = await supabase
        .from("site_content")
        .select("content")
        .eq("section_key", "theme")
        .maybeSingle();
      return (data?.content as Theme) || null;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!data) return;
    applyTheme({ colors: { ...DEFAULT_THEME.colors, ...(data.colors || {}) }, radius: data.radius ?? DEFAULT_THEME.radius });
  }, [data]);

  return null;
}
