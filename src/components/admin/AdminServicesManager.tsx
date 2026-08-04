import { useState, useEffect, useCallback } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Trash2, Plus, X, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { validateServiceTitle } from "@/lib/validateServiceTitle";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RichTextEditor } from "./RichTextEditor";
import { GalleryEditor } from "./GalleryEditor";
import { TagsInput } from "./TagsInput";
import { TagFilter, useContentTagMap } from "./TagFilter";
import { RelationshipsEditor } from "./RelationshipsEditor";
import { MediaPickerDialog } from "./MediaLibrary";

interface ServiceRow {
  id: string;
  title: string;
  description: string | null;
  description_rich: { html?: string } | any;
  category: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  gallery_images: string[] | any;
  is_active: boolean;
  request_only?: boolean;
  sort_order: number;
  type?: string | null;
}

const emptyService: Omit<ServiceRow, "id"> = {
  title: "",
  description: "",
  description_rich: { html: "" },
  category: "Massage Therapy",
  duration_minutes: 60,
  price: 0,
  image_url: null,
  gallery_images: [],
  is_active: true,
  request_only: false,
  sort_order: 0,
};

const categories = ["Massage Therapy", "Organic Facials", "Body Treatments", "Holistic Therapy", "Wellness Programs", "Manuel Antonio Experiences"];

export function AdminServicesManager() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [editing, setEditing] = useState<ServiceRow | (Omit<ServiceRow, "id"> & { id?: string }) | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | "cover" | "rt">(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagRefresh, setTagRefresh] = useState(0);
  const { tagsByContentId, tagLookup } = useContentTagMap("services", tagRefresh);

  const load = useCallback(async () => {
    const { data } = await supabase.from("services").select("*, type").order("sort_order");
    setServices((data as ServiceRow[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.title) { toast.error("Title is required"); return; }
    const payload = {
      title: editing.title,
      description: editing.description,
      description_rich: editing.description_rich || { html: "" },
      category: editing.category,
      duration_minutes: editing.duration_minutes,
      price: editing.price,
      image_url: editing.image_url,
      gallery_images: editing.gallery_images || [],
      is_active: editing.is_active,
      request_only: (editing as any).request_only ?? false,
      sort_order: editing.sort_order,
    };

    if ("id" in editing && editing.id) {
      const { error } = await supabase.from("services").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Service updated");
      setEditing(null);
      setTagRefresh((n) => n + 1);
      load();
    } else {
      const { data, error } = await supabase.from("services").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Service created");
      // re-open in edit mode so tags + relationships can be configured
      if (data) { setEditing(data as ServiceRow); load(); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const filtered = services.filter((s) => {
    if (tagFilter.length) {
      const rowTags = tagsByContentId[s.id] ?? [];
      if (!tagFilter.every((t) => rowTags.includes(t))) return false;
    }
    return true;
  });

  if (editing) {
    const isNew = !("id" in editing && editing.id);
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl text-foreground">
            {isNew ? "New Service" : "Edit Service"}
          </h3>
          <button onClick={() => { setEditing(null); setTagRefresh((n) => n + 1); load(); }}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: main fields */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Title *</label>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Category</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Price (₡ CRC)</label>
                <Input type="number" step="1" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground mt-1 font-body">{formatUsdRef(editing.price)} (reference only)</p>
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Duration (min)</label>
                <Input type="number" value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Short description</label>
              <textarea
                value={editing.description || ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body min-h-[64px]"
                rows={2}
              />
            </div>

            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Detailed description</label>
              <RichTextEditor
                value={(editing.description_rich as any)?.html ?? ""}
                onChange={(html) => setEditing({ ...editing, description_rich: { html, type: "doc" } })}
                placeholder="Full service description..."
                onImageRequest={() => new Promise((resolve) => {
                  (window as any).__rtImageResolve = (url: string) => resolve(url);
                  setPickerOpen("rt");
                })}
              />
            </div>

            <GalleryEditor
              images={(editing.gallery_images as string[]) ?? []}
              onChange={(imgs) => setEditing({ ...editing, gallery_images: imgs })}
            />
          </div>

          {/* Right: sidebar */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border p-4 space-y-4">
              <h4 className="font-heading text-sm font-medium text-foreground">Visibility</h4>
              <label className="flex items-center gap-2 text-sm font-body">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                Active
              </label>
              <label className="flex items-start gap-2 text-sm font-body">
                <input type="checkbox" className="mt-1" checked={(editing as any).request_only ?? false} onChange={(e) => setEditing({ ...editing, request_only: e.target.checked } as any)} />
                <span>
                  Request only
                  <span className="block text-xs text-muted-foreground">No online calendar — sends clients to the request form (for limited therapist availability).</span>
                </span>
              </label>
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">Sort order</label>
                <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">Cover image</h4>
              {editing.image_url ? (
                <div className="relative">
                  <img src={editing.image_url} alt="" className="w-full aspect-video object-cover rounded-lg" />
                  <button onClick={() => setEditing({ ...editing, image_url: null })} className="absolute top-2 right-2 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="aspect-video rounded-lg bg-muted/40 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPickerOpen("cover")}>
                Choose from Media Library
              </Button>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">Tags</h4>
              <TagsInput contentTable="services" contentId={"id" in editing ? editing.id : undefined} />
            </div>

            <RelationshipsEditor
              sourceTable="services"
              sourceId={"id" in editing ? editing.id : undefined}
              targetTable="products"
              relationType="related"
              title="Linked products"
            />

            <RelationshipsEditor
              sourceTable="services"
              sourceId={"id" in editing ? editing.id : undefined}
              targetTable="retreats"
              relationType="related"
              title="Linked retreats"
            />

            <RelationshipsEditor
              sourceTable="services"
              sourceId={"id" in editing ? editing.id : undefined}
              targetTable="blog_posts"
              relationType="related"
              title="Related articles"
            />
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
            if (pickerOpen === "cover") setEditing({ ...editing, image_url: url });
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

  const validationIssues = services
    .map((s) => ({ s, problem: validateServiceTitle(s) }))
    .filter((r) => r.problem);

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-medium text-foreground">Manage Services</h3>
        <div className="flex items-center gap-2">
          <TagFilter contentTable="services" value={tagFilter} onChange={setTagFilter} />
          <Button variant="default" size="sm" onClick={() => setEditing({ ...emptyService })}>
            <Plus className="h-4 w-4 mr-1" /> Add Service
          </Button>
        </div>
      </div>
      {validationIssues.length > 0 && (
        <div className="px-5 py-3 bg-destructive/10 border-b border-destructive/30">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-body font-semibold text-destructive">
                {validationIssues.length} service{validationIssues.length === 1 ? "" : "s"} have title/duration mismatches
              </p>
              <p className="font-body text-xs text-muted-foreground mt-0.5">
                Booking time slots use <code>duration_minutes</code>. Titles must include a matching duration suffix (e.g. "(60min)", "(90min)", "(2hr)") so guests see the same value everywhere.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="divide-y divide-border">
        {filtered.map((s) => {
          const tagIds = tagsByContentId[s.id] ?? [];
          const problem = validateServiceTitle(s);
          return (
            <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
              {s.image_url ? (
                <img src={s.image_url} alt="" className="w-16 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-12 rounded-lg bg-muted shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-body text-sm font-medium text-foreground truncate">{s.title}</p>
                  {problem && (
                    <span
                      title={problem}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-body bg-destructive/15 text-destructive shrink-0"
                    >
                      <AlertTriangle className="h-3 w-3" /> Mismatch
                    </span>
                  )}
                </div>
                <p className="font-body text-xs text-muted-foreground">{s.category} · {s.duration_minutes}min · {formatCRC(s.price)}</p>
                {problem && (
                  <p className="font-body text-[11px] text-destructive mt-0.5">{problem}</p>
                )}
                {tagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tagIds.map((id) => {
                      const t = tagLookup[id];
                      if (!t) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-body"
                          style={{ backgroundColor: t.color ?? "hsl(var(--muted))", color: t.color ? "white" : undefined }}
                        >
                          {t.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {s.request_only && (
                <span className="text-xs font-body font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                  Request only
                </span>
              )}
              <span className={cn(
                "text-xs font-body font-semibold px-2.5 py-0.5 rounded-full",
                s.is_active ? "bg-spa-sage/15 text-spa-sage" : "bg-muted text-muted-foreground"
              )}>
                {s.is_active ? "Active" : "Inactive"}
              </span>
              <button onClick={() => setEditing(s)} className="p-2 hover:bg-muted rounded-lg">
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={() => handleDelete(s.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No services match the current filters.</p>
        )}
      </div>
    </div>
  );
}
