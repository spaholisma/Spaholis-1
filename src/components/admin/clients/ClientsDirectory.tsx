import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Globe, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCRC } from "@/lib/currency";
import {
  countBy, displayName, FILTER_LABELS, shortDate, visibleClients,
  type ClientFilter, type ClientRow,
} from "./clientDirectory";
import { ClientProfile } from "./ClientProfile";

// Every client the studio has — not only the ones who made a website account.
// Most regulars never sign up: they come to class and are entered by hand, and
// until now they were missing from this list altogether.
export function ClientsDirectory() {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("admin_client_directory" as any);
      if (error) { setError(error.message); setRows([]); return; }
      setRows((data as ClientRow[]) ?? []);
    })();
  }, []);

  const counts = useMemo(() => countBy(rows ?? []), [rows]);
  const list = useMemo(() => visibleClients(rows ?? [], query, filter), [rows, query, filter]);

  if (openKey) {
    return <ClientProfile clientKey={openKey} onClose={() => setOpenKey(null)} />;
  }

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-medium text-foreground">Clients</h3>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              {rows === null
                ? "Loading…"
                : `${counts.all} clients · ${counts.account} with a website account · ${counts.staff} registered by staff`}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or phone…"
              aria-label="Search clients"
              className="pl-9 h-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as ClientFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-body font-medium border transition-colors",
                filter === f
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABELS[f]} <span className="opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="p-5 text-sm text-destructive font-body">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border">
                {["Client", "Account", "Classes", "Treatments", "Memberships", "Last activity", "Total"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows === null && (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted-foreground">Loading clients…</td></tr>
              )}
              {rows !== null && list.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted-foreground">No clients match.</td></tr>
              )}
              {list.map((c) => (
                <tr
                  key={c.client_key}
                  onClick={() => setOpenKey(c.client_key)}
                  className="hover:bg-muted/30 transition-colors cursor-pointer align-top"
                >
                  <td className="px-5 py-3 font-body text-sm">
                    <div className="font-medium text-foreground">{displayName(c)}</div>
                    <div className="text-xs text-muted-foreground">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {c.has_account ? (
                      <Badge variant="secondary" className="gap-1 whitespace-nowrap"><Globe className="h-3 w-3" /> Website</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 whitespace-nowrap"><UserPlus className="h-3 w-3" /> By staff</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-foreground">{c.classes}</td>
                  <td className="px-5 py-3 font-body text-sm text-foreground">{c.treatments}</td>
                  <td className="px-5 py-3 font-body text-sm">
                    {c.memberships === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="text-foreground">
                        {c.memberships_active > 0 && (
                          <span className="text-spa-sage font-medium">{c.memberships_active} active</span>
                        )}
                        {c.memberships_active > 0 && c.memberships > c.memberships_active && " · "}
                        {c.memberships > c.memberships_active && (
                          <span className="text-muted-foreground">{c.memberships - c.memberships_active} past</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-muted-foreground whitespace-nowrap">{shortDate(c.last_activity)}</td>
                  <td className="px-5 py-3 font-body text-sm text-foreground whitespace-nowrap">{formatCRC(c.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
