import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Refreshes the moment someone else changes one of these tables — so several
 * people working on the same calendar see each other's changes at once.
 *
 * Supabase Realtime sends a message for every insert, update or delete the
 * signed-in user is allowed to read (row-level security applies). The message
 * itself is not used: it only says "something changed", and `refresh` reads
 * the data again the normal way. A burst of changes (a repeated series, a
 * batch of sessions) gives one refresh, not one per row.
 *
 * The tables must be in the `supabase_realtime` publication. The 15-second
 * poll (useAutoRefresh) stays as the safety net.
 */
export function useRealtimeRefresh(tables: string[], refresh: () => unknown, enabled = true, debounceMs = 400) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = tables.join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try { void latest.current(); } catch { /* the next change or poll tries again */ }
      }, debounceMs);
    };
    const channel = supabase.channel(`live-${key}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table }, kick);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, enabled, debounceMs]);
}
