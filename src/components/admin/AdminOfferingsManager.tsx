import { useState } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Gift, Users, Info, Snowflake, Play, CalendarClock, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOfferings, useInvalidateOfferings, type Offering, type OfferingType } from "@/hooks/useOfferings";
import { useOfferingEligibleClasses, useInvalidateEligibility } from "@/hooks/useOfferingEligibility";
import { useClasses } from "@/hooks/useClasses";
import { Checkbox } from "@/components/ui/checkbox";

const TYPE_LABEL: Record<OfferingType, string> = {
  membership: "Membership",
  class_pass: "Class Pass",
  drop_in: "Drop-in",
};

const TYPE_DESCRIPTION: Record<OfferingType, string> = {
  membership: "Time-bound access (e.g. 30-day unlimited). Customers buy these — never booked as a service.",
  class_pass: "Pre-paid credit packs (e.g. 10 classes). Customers buy these — credits are redeemed when booking a class.",
  drop_in: "Single-class purchase. Buy-only — not a bookable appointment.",
};

const empty = (): Partial<Offering> => ({
  name: "",
  description: "",
  type: "class_pass",
  price: 0,
  currency: "CRC",
  credits: 10,
  duration_days: null,
  is_unlimited: false,
  status: "active",
  sort_order: 0,
  payment_link: "",
});

export function AdminOfferingsManager() {
  const { data: offerings = [], isLoading } = useOfferings({ includeInactive: true });
  const invalidate = useInvalidateOfferings();
  const invalidateElig = useInvalidateEligibility();
  const [editing, setEditing] = useState<Partial<Offering> | null>(null);
  const [eligibleClassIds, setEligibleClassIds] = useState<string[]>([]);
  const [grantOpen, setGrantOpen] = useState<Offering | null>(null);
  const { data: existingEligible = [] } = useOfferingEligibleClasses(editing?.id ?? null);

  // Sync existing eligibility into local state when opening for edit
  // (using a key on the dialog re-creates state when editing changes)
  const openEditor = (o: Partial<Offering> | null) => {
    setEditing(o);
    setEligibleClassIds([]); // reset; will be populated by effect below via the query
  };

  // Pull eligibility into editing state once it loads
  // (relies on existingEligible refreshing when editing.id changes)
  if (editing?.id && existingEligible.length > 0 && eligibleClassIds.length === 0) {
    // one-shot hydrate
    setEligibleClassIds(existingEligible);
  }

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Name is required");
    if (!editing.type) return toast.error("Type is required");

    const payload: any = {
      name: editing.name.trim(),
      description: editing.description ?? null,
      type: editing.type,
      price: Number(editing.price ?? 0),
      currency: editing.currency || "CRC",
      credits: editing.type === "class_pass" ? Number(editing.credits ?? 0) : null,
      duration_days: editing.type === "membership" ? Number(editing.duration_days ?? 0) || null : null,
      is_unlimited: editing.type === "membership" ? !!editing.is_unlimited : false,
      status: editing.status || "active",
      sort_order: Number(editing.sort_order ?? 0),
      payment_link: editing.payment_link?.trim() || null,
    };

    let offeringId = editing.id as string | undefined;
    if (offeringId) {
      const { error } = await supabase.from("offerings").update(payload).eq("id", offeringId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("offerings").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      offeringId = data.id as string;
    }

    // Sync eligibility links: replace all rows for this offering
    if (offeringId) {
      const { error: delErr } = await supabase
        .from("offering_eligible_classes")
        .delete()
        .eq("offering_id", offeringId);
      if (delErr) return toast.error(delErr.message);
      if (eligibleClassIds.length > 0) {
        const rows = eligibleClassIds.map((class_id) => ({ offering_id: offeringId, class_id }));
        const { error: insErr } = await supabase.from("offering_eligible_classes").insert(rows);
        if (insErr) return toast.error(insErr.message);
      }
    }

    toast.success(editing.id ? "Offering updated" : "Offering created");
    invalidate();
    invalidateElig();
    setEditing(null);
    setEligibleClassIds([]);
  };

  const toggleActive = async (o: Offering) => {
    const next = o.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("offerings").update({ status: next }).eq("id", o.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const remove = async (o: Offering) => {
    if (!confirm(`Delete "${o.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("offerings").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Memberships</h3>
          <p className="font-body text-sm text-muted-foreground">Purchasable items only — memberships, class passes, and drop-ins. Not bookable as appointments.</p>
        </div>
        <Button onClick={() => openEditor(empty())}>
          <Plus className="h-4 w-4 mr-1" /> New Offering
        </Button>
      </div>

      <div className="flex gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="font-body text-xs text-muted-foreground leading-relaxed">
          Offerings appear in the customer's <strong>Buy</strong> flow only. They never show up in the booking calendar or appointment dropdowns.
          To create a bookable appointment, use <strong>Services</strong> instead.
        </p>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-4">
          <TabsTrigger value="all">All ({offerings.length})</TabsTrigger>
          <TabsTrigger value="membership">Memberships ({offerings.filter((o) => o.type === "membership").length})</TabsTrigger>
          <TabsTrigger value="class_pass">Class Passes ({offerings.filter((o) => o.type === "class_pass").length})</TabsTrigger>
          <TabsTrigger value="drop_in">Drop-ins ({offerings.filter((o) => o.type === "drop_in").length})</TabsTrigger>
        </TabsList>

        {(["all", "membership", "class_pass", "drop_in"] as const).map((tab) => {
          const filtered = tab === "all" ? offerings : offerings.filter((o) => o.type === tab);
          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {tab !== "all" && (
                <p className="font-body text-xs text-muted-foreground italic px-1">{TYPE_DESCRIPTION[tab]}</p>
              )}
              <div className="bg-card rounded-2xl border border-border overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Type", "Price", "Credits / Duration", "Status", "Actions"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoading && (
                      <tr><td colSpan={6} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">Loading...</td></tr>
                    )}
                    {!isLoading && filtered.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">No offerings in this category.</td></tr>
                    )}
                    {filtered.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-5 py-4 font-body text-sm font-medium text-foreground">
                          <div>{o.name}</div>
                          {o.description && <div className="text-xs text-muted-foreground line-clamp-1">{o.description}</div>}
                          {o.status === "active" && !o.payment_link && (
                            <div className="text-xs text-amber-600 mt-0.5">⚠ No CompraClick link — Buy now uses “contact us”</div>
                          )}
                        </td>
                        <td className="px-5 py-4"><Badge variant="secondary">{TYPE_LABEL[o.type]}</Badge></td>
                        <td className="px-5 py-4 font-body text-sm text-foreground">{formatCRC(o.price)}</td>
                        <td className="px-5 py-4 font-body text-sm text-muted-foreground">
                          {o.is_unlimited ? "Unlimited" :
                           o.type === "class_pass" ? `${o.credits ?? 0} credits` :
                           o.type === "membership" ? `${o.duration_days ?? 0} days` : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Switch checked={o.status === "active"} onCheckedChange={() => toggleActive(o)} />
                            <span className="text-xs font-body text-muted-foreground">{o.status}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setGrantOpen(o)} title="Grant to user">
                              <Gift className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditor(o)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(o)} className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <UserOfferingsTable />

      <OrdersTable />

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setEligibleClassIds([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Offering" : "New Offering"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Name *</label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. 10-Class Pass" />
              </div>
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Description</label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">Type *</label>
                  <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as OfferingType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="membership">Membership</SelectItem>
                      <SelectItem value="class_pass">Class Pass</SelectItem>
                      <SelectItem value="drop_in">Drop-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">Price (₡ CRC) *</label>
                  <Input type="number" step="1" min="0" value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
                  <p className="text-xs text-muted-foreground mt-1 font-body">{formatUsdRef(editing.price)} (reference only)</p>
                </div>
              </div>

              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">CompraClick payment link</label>
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://checkout.baccredomatic.com/..."
                  value={editing.payment_link ?? ""}
                  onChange={(e) => setEditing({ ...editing, payment_link: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1 font-body">
                  Paste the BAC CompraClick link that charges this exact price. The customer's <strong>Buy now</strong> button opens it.
                  If you change the price, generate a new link for the new amount and paste it here. Leave blank to fall back to the “contact us” prompt.
                </p>
              </div>

              {editing.type === "class_pass" && (
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">Credits (# of classes)</label>
                  <Input type="number" min="1" value={editing.credits ?? 0} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} />
                </div>
              )}

              {editing.type === "membership" && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-body text-sm font-medium">Unlimited classes</p>
                      <p className="text-xs text-muted-foreground">If on, no credit limit during membership.</p>
                    </div>
                    <Switch checked={!!editing.is_unlimited} onCheckedChange={(v) => setEditing({ ...editing, is_unlimited: v })} />
                  </div>
                  <div>
                    <label className="font-body text-sm font-medium mb-1.5 block">Duration (days)</label>
                    <Input type="number" min="1" value={editing.duration_days ?? 30} onChange={(e) => setEditing({ ...editing, duration_days: Number(e.target.value) })} />
                  </div>
                  {!editing.is_unlimited && (
                    <div>
                      <label className="font-body text-sm font-medium mb-1.5 block">Included credits (optional)</label>
                      <Input type="number" min="0" value={editing.credits ?? 0} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} />
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">Sort order</label>
                  <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3">
                  <span className="font-body text-sm font-medium">Active</span>
                  <Switch checked={editing.status === "active"} onCheckedChange={(v) => setEditing({ ...editing, status: v ? "active" : "inactive" })} />
                </div>
              </div>

              {/* Eligible classes — restrict redemption */}
              {editing.type !== "drop_in" && (
                <EligibleClassesPicker
                  selectedIds={eligibleClassIds}
                  onChange={setEligibleClassIds}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditing(null); setEligibleClassIds([]); }}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant dialog */}
      <GrantDialog offering={grantOpen} onClose={() => { setGrantOpen(null); invalidate(); }} />
    </div>
  );
}

function GrantDialog({ offering, onClose }: { offering: Offering | null; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const grant = async () => {
    if (!offering) return;
    if (!email.trim()) return toast.error("Enter a customer email");
    setBusy(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, email")
        .ilike("email", email.trim())
        .limit(1);
      if (pErr) throw pErr;
      if (!profiles?.length) {
        toast.error("No customer found with that email");
        return;
      }
      const targetUserId = profiles[0].user_id;
      const expires_at =
        offering.type === "membership" && offering.duration_days
          ? new Date(Date.now() + offering.duration_days * 24 * 60 * 60 * 1000).toISOString()
          : null;
      const { error } = await supabase.from("user_offerings").insert({
        user_id: targetUserId,
        offering_id: offering.id,
        type: offering.type,
        name_snapshot: offering.name,
        price_paid: 0,
        is_unlimited: offering.is_unlimited,
        credits_total: offering.credits,
        credits_remaining: offering.credits,
        expires_at,
        status: "active",
        source: "admin_grant",
        notes: notes || null,
      });
      if (error) throw error;
      toast.success(`Granted "${offering.name}" to ${email}`);
      setEmail(""); setNotes("");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!offering} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant "{offering?.name}" to a customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="font-body text-sm font-medium mb-1.5 block">Customer email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </div>
          <div>
            <label className="font-body text-sm font-medium mb-1.5 block">Internal notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Comp, refund correction, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={grant} disabled={busy}>{busy ? "Granting..." : "Grant"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default", frozen: "outline", depleted: "secondary", expired: "secondary", cancelled: "destructive",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

/** Days left until expiry (null = no expiry). Negative shown as expired. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function UserOfferingsTable() {
  const { data: rows = [], isLoading, refetch } = useOfferingsAdminQuery();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extendRow, setExtendRow] = useState<any | null>(null);

  const call = async (fn: string, args: Record<string, any>, ok: string) => {
    setBusyId(args._id);
    try {
      const { error } = await supabase.rpc(fn as any, args);
      if (error) throw error;
      toast.success(ok);
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = !q ? rows : rows.filter((r: any) =>
    [r.customerName, r.customerEmail, r.name_snapshot, r.code]
      .filter(Boolean).some((s: string) => s.toLowerCase().includes(q)));

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-center gap-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-heading text-lg font-medium text-foreground">Memberships &amp; Passes — Customers</h3>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, pass…"
          className="ml-auto w-full sm:w-64 h-9"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Customer", "Offering", "Remaining", "Activated", "Expires", "Status", "Manage"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted-foreground">Loading...</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted-foreground">No memberships or passes found.</td></tr>}
            {filtered.map((r: any) => {
              const dl = daysLeft(r.expires_at);
              const isPass = !r.is_unlimited && r.credits_total != null;
              const busy = busyId === r.id;
              return (
                <tr key={r.id} className="hover:bg-muted/30 align-top">
                  <td className="px-4 py-3 font-body text-sm">
                    <div className="font-medium text-foreground">{r.customerName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.customerEmail}</div>
                    {r.source === "admin_grant" && <Badge variant="outline" className="mt-1 text-[10px]">granted</Badge>}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-foreground">
                    {r.name_snapshot}
                    <div className="text-xs text-muted-foreground">{TYPE_LABEL[r.type as OfferingType] ?? r.type}</div>
                  </td>
                  <td className="px-4 py-3 font-body text-sm">
                    {r.is_unlimited ? (
                      <span className="text-muted-foreground">Unlimited</span>
                    ) : isPass ? (
                      <span className={cn("font-semibold", (r.credits_remaining ?? 0) <= 0 ? "text-destructive" : "text-foreground")}>
                        {r.credits_remaining ?? 0}<span className="text-muted-foreground font-normal"> / {r.credits_total}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.starts_at)}</td>
                  <td className="px-4 py-3 font-body text-sm whitespace-nowrap">
                    {r.status === "frozen" ? (
                      <span className="text-sky-600 font-medium">Paused</span>
                    ) : r.expires_at ? (
                      <div>
                        <div className="text-foreground">{fmtDate(r.expires_at)}</div>
                        {dl != null && (
                          <div className={cn("text-xs", dl < 0 ? "text-destructive" : dl <= 7 ? "text-amber-600" : "text-muted-foreground")}>
                            {dl < 0 ? `${-dl}d ago` : `${dl}d left`}
                          </div>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground">No expiry</span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.status === "active" && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                          onClick={() => call("admin_freeze_offering", { _id: r.id }, "Frozen")} title="Pause: stops the expiry clock and blocks use">
                          <Snowflake className="h-3.5 w-3.5 mr-1" /> Freeze
                        </Button>
                      )}
                      {r.status === "frozen" && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                          onClick={() => call("admin_unfreeze_offering", { _id: r.id }, "Resumed — expiry pushed forward")} title="Resume and extend expiry by the paused time">
                          <Play className="h-3.5 w-3.5 mr-1" /> Unfreeze
                        </Button>
                      )}
                      {(r.status === "active" || r.status === "expired" || r.status === "frozen") && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                          onClick={() => setExtendRow(r)} title="Add or remove days">
                          <CalendarClock className="h-3.5 w-3.5 mr-1" /> Extend
                        </Button>
                      )}
                      {r.status === "cancelled" ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                          onClick={() => call("admin_set_offering_status", { _id: r.id, _status: "active" }, "Reactivated")}>
                          Reactivate
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" disabled={busy}
                          onClick={() => { if (confirm(`Cancel "${r.name_snapshot}" for ${r.customerName || r.customerEmail || "this customer"}?`)) call("admin_set_offering_status", { _id: r.id, _status: "cancelled" }, "Cancelled"); }}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ExtendDialog row={extendRow} onClose={() => setExtendRow(null)} onDone={refetch} />
    </div>
  );
}

function ExtendDialog({ row, onClose, onDone }: { row: any | null; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  if (!row) return null;

  const apply = async (d: number) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_extend_offering" as any, { _id: row.id, _days: d });
      if (error) throw error;
      toast.success(d >= 0 ? `Extended ${d} days` : `Shortened ${-d} days`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Extend “{row.name_snapshot}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current expiry: <strong>{fmtDate(row.expires_at)}</strong>{row.expires_at ? "" : " (none — counts from today)"}.
          </p>
          <div className="flex flex-wrap gap-2">
            {[7, 15, 30, 90].map((d) => (
              <Button key={d} variant="outline" size="sm" disabled={busy} onClick={() => apply(d)}>+{d} days</Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="font-body text-sm font-medium mb-1.5 block">Custom (± days)</label>
              <Input type="number" value={days} onChange={(e) => setDays(parseInt(e.target.value) || 0)} />
            </div>
            <Button disabled={busy} onClick={() => apply(days)}>Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useQuery } from "@tanstack/react-query";
function useOfferingsAdminQuery() {
  return useQuery({
    queryKey: ["admin-user-offerings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_offerings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      const rows = data ?? [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      const map = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        for (const p of profiles ?? []) map.set(p.user_id, p);
      }
      // Registered buyer's profile, else the guest details captured at checkout.
      return rows.map((r: any) => {
        const p = r.user_id ? map.get(r.user_id) : null;
        return {
          ...r,
          customerName: p?.full_name || r.guest_name || null,
          customerEmail: p?.email || r.guest_email || null,
        };
      });
    },
  });
}

/** Payment records (PayPal) — read-only ledger of what customers paid for. */
function OrdersTable() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-paypal-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paypal_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-heading text-lg font-medium text-foreground">Orders (payments)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Date", "Customer", "For", "Amount", "Status", "Order ID"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">No orders yet.</td></tr>}
            {rows.map((o: any) => {
              const t = o.target || {};
              return (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-body text-sm text-muted-foreground whitespace-nowrap">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3 font-body text-sm">
                    <div className="text-foreground">{t.guest_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{t.guest_email}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary">{o.kind}</Badge></td>
                  <td className="px-4 py-3 font-body text-sm text-foreground whitespace-nowrap">{o.amount} {o.currency}</td>
                  <td className="px-4 py-3">
                    <Badge variant={o.status === "captured" ? "default" : o.status === "created" ? "outline" : "secondary"}>{o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.order_id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EligibleClassesPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: classes = [], isLoading } = useClasses();
  const allSelected = selectedIds.length === 0; // empty = universal

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-body text-sm font-medium">Eligible classes</p>
          <p className="text-xs text-muted-foreground">
            {allSelected
              ? "Currently usable for all classes. Select specific classes to restrict."
              : `Restricted to ${selectedIds.length} class${selectedIds.length === 1 ? "" : "es"}.`}
          </p>
        </div>
        {!allSelected && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            All classes
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading classes…</p>
      ) : classes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active classes yet.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
          {classes.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm font-body cursor-pointer hover:bg-muted/40 px-2 py-1 rounded"
            >
              <Checkbox
                checked={selectedIds.includes(c.id)}
                onCheckedChange={() => toggle(c.id)}
              />
              <span className="text-foreground">{c.title}</span>
              {c.category && (
                <span className="text-xs text-muted-foreground">· {c.category}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
