import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Gift } from "lucide-react";

type Offering = { id: string; name: string; type: string; loyalty_threshold: number | null; sort_order: number };
type Config = { id: boolean; enabled: boolean; reward_service_id: string | null; reward_label: string };
type Service = { id: string; title: string };
type Reward = {
  id: string; customer_email: string; customer_name: string | null;
  offering_name: string | null; reward_service_title: string | null;
  earned_after: number; status: string; created_at: string; redeemed_at: string | null;
};

export function AdminLoyaltyManager() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const sb = supabase as any;
  const loadAll = useCallback(async () => {
    const [o, c, s, r] = await Promise.all([
      sb.from("offerings").select("id, name, type, loyalty_threshold, sort_order").order("sort_order"),
      sb.from("membership_reward_config").select("*").maybeSingle(),
      sb.from("services").select("id, title").eq("type", "treatment").eq("is_active", true).order("sort_order"),
      sb.from("membership_rewards").select("id, customer_email, customer_name, offering_name, reward_service_title, earned_after, status, created_at, redeemed_at").order("status").order("created_at", { ascending: false }).limit(100),
    ]);
    setOfferings((o.data as Offering[]) ?? []);
    setConfig((c.data as Config) ?? { id: true, enabled: true, reward_service_id: null, reward_label: "a free Pure Bliss 60-min massage" });
    setServices((s.data as Service[]) ?? []);
    setRewards((r.data as Reward[]) ?? []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveConfig = async () => {
    if (!config) return;
    setSavingCfg(true);
    const { error } = await sb.from("membership_reward_config")
      .upsert({ id: true, enabled: config.enabled, reward_service_id: config.reward_service_id, reward_label: config.reward_label });
    setSavingCfg(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Reward settings saved");
  };

  const saveThresholds = async () => {
    setSavingThresholds(true);
    try {
      for (const o of offerings) {
        await sb.from("offerings").update({ loyalty_threshold: o.loyalty_threshold }).eq("id", o.id);
      }
      toast.success("Renewal thresholds saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSavingThresholds(false);
    }
  };

  const markRedeemed = async (id: string) => {
    const { error } = await sb.from("membership_rewards")
      .update({ status: "redeemed", redeemed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Reward marked as redeemed");
    loadAll();
  };

  const setThreshold = (id: string, val: string) =>
    setOfferings((prev) => prev.map((o) => (o.id === id ? { ...o, loyalty_threshold: val === "" ? null : Math.max(0, parseInt(val) || 0) } : o)));

  const pending = rewards.filter((r) => r.status === "pending");
  const past = rewards.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Loyalty Rewards</h2>
        <p className="text-sm text-muted-foreground">Members earn a free treatment after renewing a membership or pass a set number of times.</p>
      </div>

      {/* Reward settings */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <h3 className="font-heading text-lg font-medium text-foreground flex items-center gap-2"><Gift className="h-4 w-4 text-spa-sage" /> The Reward</h3>
        <div className="flex items-center gap-3">
          <Switch checked={config?.enabled ?? true} onCheckedChange={(v) => setConfig((c) => c && { ...c, enabled: v })} />
          <span className="font-body text-sm text-foreground">Program active</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Free treatment given as reward</label>
            <select
              value={config?.reward_service_id ?? ""}
              onChange={(e) => setConfig((c) => c && { ...c, reward_service_id: e.target.value || null })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— Select a treatment —</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">How it reads to members</label>
            <Input value={config?.reward_label ?? ""} onChange={(e) => setConfig((c) => c && { ...c, reward_label: e.target.value })} placeholder="a free Pure Bliss 60-min massage" />
          </div>
        </div>
        <Button size="sm" onClick={saveConfig} disabled={savingCfg}>{savingCfg ? "Saving…" : "Save reward settings"}</Button>
      </div>

      {/* Thresholds per membership */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <h3 className="font-heading text-lg font-medium text-foreground">Renewals needed per membership</h3>
        <p className="text-xs text-muted-foreground">Number of purchases/renewals that earn one reward. Leave blank for no reward. Members keep earning every N renewals.</p>
        <div className="space-y-2">
          {offerings.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <div className="min-w-0">
                <span className="font-body text-sm font-medium text-foreground">{o.name}</span>
                <span className="ml-2 text-xs text-muted-foreground capitalize">{o.type.replace("_", " ")}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input type="number" min={0} value={o.loyalty_threshold ?? ""} onChange={(e) => setThreshold(o.id, e.target.value)} className="w-20 h-9" placeholder="—" />
                <span className="text-xs text-muted-foreground">renewals</span>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={saveThresholds} disabled={savingThresholds}>{savingThresholds ? "Saving…" : "Save thresholds"}</Button>
      </div>

      {/* Earned rewards */}
      <div className="bg-card rounded-2xl border border-border">
        <div className="p-5 border-b border-border">
          <h3 className="font-heading text-lg font-medium text-foreground">Rewards earned {pending.length > 0 && <span className="ml-1 text-xs font-body font-semibold text-spa-sage">({pending.length} to give)</span>}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Customer", "For renewing", "Reward", "Earned", "Status", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...pending, ...past].map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4 font-body text-sm text-foreground">
                    <div className="font-medium">{r.customer_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                  </td>
                  <td className="px-5 py-4 font-body text-sm text-muted-foreground">{r.offering_name} ×{r.earned_after}</td>
                  <td className="px-5 py-4 font-body text-sm text-foreground">{r.reward_service_title}</td>
                  <td className="px-5 py-4 font-body text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <span className={cn("text-xs font-body font-semibold px-3 py-1 rounded-full",
                      r.status === "pending" ? "bg-spa-sage/15 text-spa-sage" : "bg-muted text-muted-foreground")}>
                      {r.status === "pending" ? "To give" : "Redeemed"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => markRedeemed(r.id)}>Mark given</Button>
                    )}
                  </td>
                </tr>
              ))}
              {rewards.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">No rewards earned yet. Members earn one after enough renewals.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
