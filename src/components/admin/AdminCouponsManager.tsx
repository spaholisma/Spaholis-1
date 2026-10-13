import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminLocalDiscountSetting } from "@/components/admin/AdminLocalDiscountSetting";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  restricted_service_ids: string[] | null;
  restricted_class_ids: string[] | null;
  restricted_product_ids: string[] | null;
  restricted_package_ids: string[] | null;
  /** Holis passes and memberships it works on (none = not on passes, unless it has no restriction at all). */
  restricted_offering_ids?: string[] | null;
}

interface ItemOption {
  id: string;
  title: string;
  category: string | null;
}

const emptyCoupon = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: 10,
  max_uses: null as number | null,
  is_active: true,
  expires_at: "",
  restricted_service_ids: [] as string[],
  restricted_class_ids: [] as string[],
  restricted_product_ids: [] as string[],
  restricted_package_ids: [] as string[],
  restricted_offering_ids: [] as string[],
};

type RestrictionKey =
  | "restricted_service_ids"
  | "restricted_class_ids"
  | "restricted_product_ids"
  | "restricted_package_ids"
  | "restricted_offering_ids";

export function AdminCouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [services, setServices] = useState<ItemOption[]>([]);
  const [classes, setClasses] = useState<ItemOption[]>([]);
  const [products, setProducts] = useState<ItemOption[]>([]);
  const [packages, setPackages] = useState<ItemOption[]>([]);
  const [offerings, setOfferings] = useState<ItemOption[]>([]);
  const [editing, setEditing] = useState<(typeof emptyCoupon & { id?: string }) | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
  }, []);

  const loadOptions = useCallback(async () => {
    const [s, c, p, pk, of] = await Promise.all([
      supabase.from("services").select("id, title, category").order("category").order("title"),
      supabase.from("classes").select("id, title, category").order("category").order("title"),
      supabase.from("products").select("id, name, category").order("category").order("name"),
      supabase.from("spa_packages").select("id, name").order("position"),
      (supabase as any).from("offerings").select("id, name, status").order("sort_order"),
    ]);
    setServices((s.data as ItemOption[]) ?? []);
    setClasses((c.data as ItemOption[]) ?? []);
    setProducts(((p.data as any[]) ?? []).map((r) => ({ id: r.id, title: r.name, category: r.category })));
    setPackages(((pk.data as any[]) ?? []).map((r) => ({ id: r.id, title: r.name, category: "Spa Packages" })));
    setOfferings(((of.data as any[]) ?? []).map((r) => ({ id: r.id, title: r.name, category: r.status === "active" ? "Passes & memberships" : "Inactive" })));
  }, []);

  useEffect(() => { load(); loadOptions(); }, [load, loadOptions]);

  const handleSave = async () => {
    if (!editing?.code) { toast.error("Code is required"); return; }
    const payload = {
      code: editing.code.toUpperCase(),
      description: editing.description || null,
      discount_type: editing.discount_type,
      discount_value: editing.discount_value,
      max_uses: editing.max_uses || null,
      is_active: editing.is_active,
      expires_at: editing.expires_at || null,
      restricted_service_ids: editing.restricted_service_ids?.length ? editing.restricted_service_ids : null,
      restricted_class_ids: editing.restricted_class_ids?.length ? editing.restricted_class_ids : null,
      restricted_product_ids: editing.restricted_product_ids?.length ? editing.restricted_product_ids : null,
      restricted_package_ids: editing.restricted_package_ids?.length ? editing.restricted_package_ids : null,
      restricted_offering_ids: editing.restricted_offering_ids?.length ? editing.restricted_offering_ids : null,
    };

    if (editing.id) {
      // restricted_offering_ids is newer than the generated types.
      const { error } = await (supabase as any).from("coupons").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon updated");
    } else {
      const { error } = await (supabase as any).from("coupons").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon created");
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this coupon?")) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("coupons").update({ is_active: !isActive }).eq("id", id);
    load();
  };

  if (editing) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-lg font-medium text-foreground">
            {editing.id ? "Edit Coupon" : "New Coupon"}
          </h3>
          <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Code *</label>
            <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="SUMMER20" />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Discount Type</label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
              value={editing.discount_type}
              onChange={(e) => setEditing({ ...editing, discount_type: e.target.value })}
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount ($)</option>
            </select>
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
              Discount Value {editing.discount_type === "percentage" ? "(%)" : "($)"}
            </label>
            <Input type="number" value={editing.discount_value} onChange={(e) => setEditing({ ...editing, discount_value: Number(e.target.value) })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Max Uses (blank = unlimited)</label>
            <Input type="number" value={editing.max_uses ?? ""} onChange={(e) => setEditing({ ...editing, max_uses: e.target.value ? Number(e.target.value) : null })} placeholder="Unlimited" />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Expires At</label>
            <Input type="datetime-local" value={editing.expires_at || ""} onChange={(e) => setEditing({ ...editing, expires_at: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Description</label>
          <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Optional description" />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-body">
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            Active
          </label>
        </div>

        {([
          { key: "restricted_service_ids", label: "Services / Treatments", items: services, emptyMsg: "No services available." },
          { key: "restricted_class_ids", label: "Classes", items: classes, emptyMsg: "No classes available." },
          { key: "restricted_product_ids", label: "Products", items: products, emptyMsg: "No products available." },
          { key: "restricted_package_ids", label: "Spa Packages", items: packages, emptyMsg: "No spa packages available." },
          {
            key: "restricted_offering_ids", label: "Passes & memberships", items: offerings, emptyMsg: "No passes available.",
            note: "Tick the passes this coupon works on when bought online (Memberships page). None ticked = it does not work on passes — unless the coupon has no restriction at all.",
          },
        ] as { key: RestrictionKey; label: string; items: ItemOption[]; emptyMsg: string; note?: string }[]).map((section) => {
          const current = (editing[section.key] as string[]) || [];
          return (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-body text-sm font-medium text-foreground">
                  Applies to {section.label}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setEditing({ ...editing, [section.key]: [] })}
                  >
                    All (clear)
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setEditing({ ...editing, [section.key]: section.items.map((s) => s.id) })}
                  >
                    Select all
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {section.note ?? `Leave empty to apply to all ${section.label.toLowerCase()}. Select specific ones to restrict redemption.`}
              </p>
              <div className="max-h-56 overflow-y-auto border border-input rounded-lg p-3 space-y-3 bg-background">
                {Object.entries(
                  section.items.reduce((acc, s) => {
                    const cat = s.category || "Other";
                    (acc[cat] ||= []).push(s);
                    return acc;
                  }, {} as Record<string, ItemOption[]>)
                ).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{cat}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {items.map((s) => {
                        const checked = current.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-sm font-body cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const set = new Set(current);
                                if (e.target.checked) set.add(s.id); else set.delete(s.id);
                                setEditing({ ...editing, [section.key]: Array.from(set) });
                              }}
                            />
                            <span className="text-foreground">{s.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {section.items.length === 0 && (
                  <div className="text-sm text-muted-foreground">{section.emptyMsg}</div>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <AdminLocalDiscountSetting />
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h3 className="font-heading text-lg font-medium text-foreground">Coupon Management</h3>
        <Button variant="default" size="sm" onClick={() => setEditing({ ...emptyCoupon })}>
          <Plus className="h-4 w-4 mr-1" /> Create Coupon
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Code", "Discount", "Uses", "Expires", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {coupons.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-4 font-body text-sm font-mono font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    {c.code}
                    <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}>
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </td>
                <td className="px-5 py-4 font-body text-sm text-foreground">
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `$${c.discount_value}`}
                </td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">
                  {c.current_uses}{c.max_uses ? ` / ${c.max_uses}` : " / ∞"}
                </td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
                </td>
                <td className="px-5 py-4">
                  <span className={cn(
                    "text-xs font-body font-semibold px-3 py-1 rounded-full",
                    c.is_active ? "bg-spa-sage/15 text-spa-sage" : "bg-muted text-muted-foreground"
                  )}>{c.is_active ? "Active" : "Inactive"}</span>
                </td>
                <td className="px-5 py-4 flex items-center gap-1">
                  <button onClick={() => setEditing({ ...c, expires_at: c.expires_at || "", restricted_service_ids: c.restricted_service_ids ?? [], restricted_class_ids: c.restricted_class_ids ?? [], restricted_product_ids: c.restricted_product_ids ?? [], restricted_package_ids: (c as any).restricted_package_ids ?? [], restricted_offering_ids: c.restricted_offering_ids ?? [] })} className="p-2 hover:bg-muted rounded-lg">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleActive(c.id, c.is_active)}>
                    {c.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">No coupons yet. Create your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
