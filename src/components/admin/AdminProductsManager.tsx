import { useState, useEffect, useCallback } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Trash2, Plus, X, Copy, Search, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { slugify } from "@/lib/slug";
import { RichTextEditor } from "./RichTextEditor";
import { MediaPickerDialog } from "./MediaLibrary";
import { GalleryEditor } from "./GalleryEditor";
import { TagsInput } from "./TagsInput";
import { TagFilter, useContentTagMap } from "./TagFilter";
import { RelationshipsEditor } from "./RelationshipsEditor";

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: { html?: string } | any;
  price: number;
  compare_at_price: number | null;
  currency: string;
  sku: string | null;
  stock: number | null;
  track_inventory: boolean;
  cover_image: string | null;
  gallery_images: string[] | any;
  category: string | null;
  status: string;
  featured: boolean;
  sort_order: number;
  external_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

const empty: Omit<ProductRow, "id"> = {
  name: "",
  slug: "",
  short_description: "",
  description: { html: "" },
  price: 0,
  compare_at_price: null,
  currency: "CRC",
  sku: null,
  stock: null,
  track_inventory: false,
  cover_image: null,
  gallery_images: [],
  category: null,
  status: "draft",
  featured: false,
  sort_order: 0,
  external_url: null,
  seo_title: "",
  seo_description: "",
};

export function AdminProductsManager() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [editing, setEditing] = useState<ProductRow | (Omit<ProductRow, "id"> & { id?: string }) | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagRefresh, setTagRefresh] = useState(0);
  const { tagsByContentId, tagLookup } = useContentTagMap("products", tagRefresh);
  const [pickerOpen, setPickerOpen] = useState<null | "cover" | "rt">(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing) return;
    if ("id" in editing && editing.id) return;
    if (slugTouched) return;
    const auto = slugify(editing.name || "");
    if (auto && auto !== editing.slug) setEditing({ ...editing, slug: auto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.name]);

  const startNew = () => { setSlugTouched(false); setEditing({ ...empty }); };
  const startEdit = (p: ProductRow) => { setSlugTouched(true); setEditing(p); };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name is required"); return; }
    if (!editing.slug.trim()) { toast.error("Slug is required"); return; }

    const payload = {
      name: editing.name.trim(),
      slug: slugify(editing.slug),
      short_description: editing.short_description,
      description: editing.description || { html: "" },
      price: editing.price,
      compare_at_price: editing.compare_at_price,
      currency: editing.currency,
      sku: editing.sku,
      stock: editing.stock,
      track_inventory: editing.track_inventory,
      cover_image: editing.cover_image,
      gallery_images: editing.gallery_images || [],
      category: editing.category,
      status: editing.status,
      featured: editing.featured,
      sort_order: editing.sort_order,
      external_url: editing.external_url,
      seo_title: editing.seo_title,
      seo_description: editing.seo_description,
    };

    if ("id" in editing && editing.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Product updated");
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Product created");
      // Re-open in edit mode so tags & relationships can be configured immediately
      if (data) { setEditing(data as ProductRow); setSlugTouched(true); load(); return; }
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const handleDuplicate = async (p: ProductRow) => {
    const { id, ...rest } = p;
    const { error } = await supabase.from("products").insert({
      ...rest,
      name: `${p.name} (Copy)`,
      slug: `${p.slug}-copy-${Date.now().toString(36).slice(-4)}`,
      status: "draft",
      featured: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Duplicated");
    load();
  };

  const togglePublish = async (p: ProductRow) => {
    const next = p.status === "published" ? "draft" : "published";
    const { error } = await supabase.from("products").update({ status: next }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.slug.toLowerCase().includes(s)) return false;
    }
    if (tagFilter.length) {
      const rowTags = tagsByContentId[r.id] ?? [];
      // require ALL selected tags to be present (AND semantics)
      if (!tagFilter.every((t) => rowTags.includes(t))) return false;
    }
    return true;
  });

  if (editing) {
    const isNew = !("id" in editing && editing.id);
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl text-foreground">{isNew ? "New Product" : "Edit Product"}</h3>
          <button onClick={() => { setEditing(null); setTagRefresh((n) => n + 1); load(); }}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: main fields */}
          <div className="lg:col-span-2 space-y-5">
            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Name *</label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Product name" />
            </div>

            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Slug *</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">/products/</span>
                <Input
                  value={editing.slug}
                  onChange={(e) => { setSlugTouched(true); setEditing({ ...editing, slug: e.target.value }); }}
                  placeholder="auto-from-name"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ ...editing, slug: slugify(editing.name) })}>
                  Regen
                </Button>
              </div>
            </div>

            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Short description</label>
              <Textarea value={editing.short_description ?? ""} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} rows={2} />
            </div>

            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Description</label>
              <RichTextEditor
                value={(editing.description as any)?.html ?? ""}
                onChange={(html) => setEditing({ ...editing, description: { ...(editing.description || {}), html, type: "doc" } })}
                placeholder="Detailed product description..."
                onImageRequest={() => new Promise((resolve) => {
                  (window as any).__rtImageResolve = (url: string) => resolve(url);
                  setPickerOpen("rt");
                })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Price ($ USD)</label>
                <Input type="number" step="1" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Compare-at price ($ USD)</label>
                <Input type="number" step="1" value={editing.compare_at_price ?? ""} onChange={(e) => setEditing({ ...editing, compare_at_price: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">SKU</label>
                <Input value={editing.sku ?? ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value || null })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Stock</label>
                <Input type="number" value={editing.stock ?? ""} onChange={(e) => setEditing({ ...editing, stock: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Category</label>
                <Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value || null })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">External URL</label>
                <Input value={editing.external_url ?? ""} onChange={(e) => setEditing({ ...editing, external_url: e.target.value || null })} placeholder="https://..." />
              </div>
            </div>

            <GalleryEditor
              images={(editing.gallery_images as string[]) ?? []}
              onChange={(imgs) => setEditing({ ...editing, gallery_images: imgs })}
            />
          </div>

          {/* Right: sidebar */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border p-4 space-y-4">
              <h4 className="font-heading text-sm font-medium text-foreground">Publish</h4>
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <label className="font-body text-sm text-foreground">Featured</label>
                <Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="font-body text-sm text-foreground">Track inventory</label>
                <Switch checked={editing.track_inventory} onCheckedChange={(v) => setEditing({ ...editing, track_inventory: v })} />
              </div>
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">Sort order</label>
                <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">Cover image</h4>
              {editing.cover_image ? (
                <div className="relative">
                  <img src={editing.cover_image} alt="" className="w-full aspect-square object-cover rounded-lg" />
                  <button onClick={() => setEditing({ ...editing, cover_image: null })} className="absolute top-2 right-2 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-muted/40 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPickerOpen("cover")}>
                Choose from Media Library
              </Button>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">Tags</h4>
              <TagsInput contentTable="products" contentId={"id" in editing ? editing.id : undefined} />
            </div>

            <RelationshipsEditor
              sourceTable="products"
              sourceId={"id" in editing ? editing.id : undefined}
              targetTable="retreats"
              relationType="related"
              title="Linked retreats"
            />

            <RelationshipsEditor
              sourceTable="products"
              sourceId={"id" in editing ? editing.id : undefined}
              targetTable="services"
              relationType="related"
              title="Linked services"
            />

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">SEO</h4>
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">SEO title</label>
                <Input value={editing.seo_title ?? ""} onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })} maxLength={60} />
                <p className="text-[10px] text-muted-foreground mt-1">{(editing.seo_title ?? "").length}/60</p>
              </div>
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">SEO description</label>
                <Textarea value={editing.seo_description ?? ""} onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })} maxLength={160} rows={3} />
                <p className="text-[10px] text-muted-foreground mt-1">{(editing.seo_description ?? "").length}/160</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-border">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="ghost" onClick={() => { setEditing(null); setTagRefresh((n) => n + 1); load(); }}>Close</Button>
        </div>

        <MediaPickerDialog
          open={pickerOpen !== null}
          onOpenChange={(v) => { if (!v) setPickerOpen(null); }}
          onSelect={(url) => {
            if (pickerOpen === "cover") setEditing({ ...editing, cover_image: url });
            else if (pickerOpen === "rt") {
              const fn = (window as any).__rtImageResolve;
              if (fn) { fn(url); (window as any).__rtImageResolve = null; }
            }
            setPickerOpen(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border">
        <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-lg font-medium text-foreground">Products</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 w-56" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <TagFilter contentTable="products" value={tagFilter} onChange={setTagFilter} />
            <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" /> New</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left">
              <tr>
                <th className="p-3 font-medium">Image</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Tags</th>
                <th className="p-3 font-medium">Featured</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No products match the current filters.</td></tr>
              ) : filtered.map((p) => {
                const rowTagIds = tagsByContentId[p.id] ?? [];
                return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3">
                    {p.cover_image ? (
                      <img src={p.cover_image} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">/{p.slug}</div>
                  </td>
                  <td className="p-3">{formatCRC(p.price)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => togglePublish(p)}
                      className={cn("px-2 py-0.5 rounded-full text-xs",
                        p.status === "published" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground")}
                    >
                      {p.status}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {rowTagIds.length === 0 && <span className="text-xs text-muted-foreground italic">—</span>}
                      {rowTagIds.map((id) => {
                        const t = tagLookup[id];
                        if (!t) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-body"
                            style={{ backgroundColor: t.color ?? "hsl(var(--muted))", color: t.color ? "white" : undefined }}
                          >
                            {t.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3">{p.featured ? "★" : ""}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDuplicate(p)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
