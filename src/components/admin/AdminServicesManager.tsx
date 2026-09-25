import { useState, useEffect, useCallback, useMemo } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  Pencil, Trash2, Plus, X, Image as ImageIcon, AlertTriangle, Search, ExternalLink, Package, Loader2,
} from "lucide-react";
import { validateServiceTitle } from "@/lib/validateServiceTitle";
import {
  blankToNull, categoryLabel, categoryOptions, filterServices, richOrNull, serviceWebsitePath,
  SERVICE_TYPES, sortServices, type StatusFilter,
} from "@/lib/adminServices";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RichTextEditor } from "./RichTextEditor";
import { GalleryEditor } from "./GalleryEditor";
import { TagsInput } from "./TagsInput";
import { TagFilter, useContentTagMap } from "./TagFilter";
import { RelationshipsEditor } from "./RelationshipsEditor";
import { MediaPickerDialog } from "./MediaLibrary";
import { ExtraEditor, ExtraRowItem, openOwnEditor, opensOwnEditor, useOtherOfferings } from "./OtherOfferings";
import { EXTRA_CATEGORIES, filterExtraRows, type ExtraRow } from "@/lib/otherOfferings";

interface ServiceRow {
  id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  description_rich: { html?: string } | any;
  description_rich_es: { html?: string } | any;
  category: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  gallery_images: string[] | any;
  is_active: boolean;
  is_addon: boolean;
  request_only?: boolean;
  location_available?: boolean;
  /** Add-on extras this treatment already includes — not offered with it. */
  included_addon_ids?: string[];
  sort_order: number;
  type: string | null;
}

type Draft = Omit<ServiceRow, "id"> & { id?: string };

interface LinkedPackage {
  id: string;
  name: string;
  service_id: string | null;
}

const emptyService: Draft = {
  title: "",
  title_es: null,
  description: "",
  description_es: null,
  description_rich: { html: "" },
  description_rich_es: null,
  category: "Massage Therapy",
  duration_minutes: 60,
  price: 0,
  image_url: null,
  gallery_images: [],
  is_active: true,
  is_addon: false,
  request_only: false,
  location_available: true,
  included_addon_ids: [],
  sort_order: 0,
  type: "treatment",
};

const typeLabel: Record<string, string> = {
  program: "Program",
  experience: "Experience",
  course: "Course",
  workshop: "Workshop",
};

export function AdminServicesManager() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [packages, setPackages] = useState<LinkedPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [lang, setLang] = useState<"en" | "es">("en");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | "cover" | "rt">(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagRefresh, setTagRefresh] = useState(0);
  const { tagsByContentId, tagLookup } = useContentTagMap("services", tagRefresh);
  // Private classes, studio rates, signature cards, memberships and retreats.
  const other = useOtherOfferings();
  const [extraEditing, setExtraEditing] = useState<ExtraRow | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: pkgs }] = await Promise.all([
      supabase.from("services").select("*").order("sort_order"),
      supabase.from("spa_packages").select("id, name, service_id"),
    ]);
    if (error) toast.error(error.message);
    setServices((data as unknown as ServiceRow[]) ?? []);
    setPackages((pkgs as unknown as LinkedPackage[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const packageFor = (serviceId?: string) => packages.find((p) => p.service_id && p.service_id === serviceId);

  const closeEditor = () => {
    setEditing(null);
    setLang("en");
    setTagRefresh((n) => n + 1);
    load();
  };

  const handleSave = async () => {
    if (!editing?.title.trim()) { toast.error("The English name is required"); setLang("en"); return; }
    setSaving(true);
    const payload = {
      title: editing.title.trim(),
      title_es: blankToNull(editing.title_es),
      description: editing.description,
      description_es: blankToNull(editing.description_es),
      description_rich: editing.description_rich || { html: "" },
      description_rich_es: richOrNull(editing.description_rich_es),
      category: editing.category,
      type: editing.type || "treatment",
      duration_minutes: editing.duration_minutes,
      price: editing.price,
      image_url: editing.image_url,
      gallery_images: editing.gallery_images || [],
      is_active: editing.is_active,
      is_addon: editing.is_addon,
      request_only: editing.request_only ?? false,
      location_available: editing.location_available ?? true,
      // An extra cannot include extras.
      included_addon_ids: editing.is_addon ? [] : (editing.included_addon_ids ?? []),
      sort_order: editing.sort_order,
    };

    try {
      if (editing.id) {
        const { error } = await supabase.from("services").update(payload as any).eq("id", editing.id);
        if (error) throw error;
        // A Spa Package card on the website has its own name and price; keep
        // them in step with the service guests actually book.
        const pkg = packageFor(editing.id);
        if (pkg) {
          const { error: pkgError } = await supabase
            .from("spa_packages")
            .update({ name: payload.title, price: payload.price, is_active: payload.is_active })
            .eq("id", pkg.id);
          if (pkgError) toast.error(`Service saved, but the package card was not updated: ${pkgError.message}`);
        }
        toast.success(`"${payload.title}" saved — it's live on the website`);
        closeEditor();
      } else {
        const { data, error } = await supabase.from("services").insert(payload as any).select().single();
        if (error) throw error;
        toast.success("Service created");
        // Stay in the editor so tags and relationships can be set.
        if (data) { setEditing(data as unknown as ServiceRow); load(); }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (s: ServiceRow, active: boolean) => {
    setServices((list) => list.map((x) => (x.id === s.id ? { ...x, is_active: active } : x)));
    const { error } = await supabase.from("services").update({ is_active: active }).eq("id", s.id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    const pkg = packageFor(s.id);
    if (pkg) await supabase.from("spa_packages").update({ is_active: active }).eq("id", pkg.id);
    toast.success(active ? `"${s.title}" is visible on the website` : `"${s.title}" is hidden from the website`);
  };

  const handleDelete = async (s: { id: string; title: string }) => {
    if (!confirm(`Delete "${s.title}" permanently?\n\nTip: to just remove it from the website, turn it off instead — you can turn it back on any time.`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) {
      if ((error as any).code === "23503") {
        toast.error("This service has bookings or a package linked to it, so it can't be deleted. Turn it off instead to hide it from the website.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Deleted");
    if (editing?.id === s.id) setEditing(null);
    load();
  };

  const categories = useMemo(() => categoryOptions(services), [services]);
  const visible = useMemo(() => {
    const byFilters = filterServices(services, { query, category, status });
    const byTags = tagFilter.length
      ? byFilters.filter((s) => tagFilter.every((t) => (tagsByContentId[s.id] ?? []).includes(t)))
      : byFilters;
    return sortServices(byTags);
  }, [services, query, category, status, tagFilter, tagsByContentId]);
  const visibleExtras = useMemo(
    () => (tagFilter.length ? [] : filterExtraRows(other.rows, { query, category, status })),
    [other.rows, query, category, status, tagFilter],
  );
  const openExtra = (row: ExtraRow) => (opensOwnEditor(row) ? openOwnEditor(row) : setExtraEditing(row));

  if (extraEditing) {
    return (
      <ExtraEditor
        row={extraEditing}
        services={services.filter((s) => s.is_active && !s.is_addon)}
        onClose={() => { setExtraEditing(null); other.reload(); }}
      />
    );
  }

  // ─────────────────────────── Editor ───────────────────────────
  if (editing) {
    const isNew = !editing.id;
    const pkg = packageFor(editing.id);
    const website = serviceWebsitePath(editing);
    const problem = validateServiceTitle(editing);
    const es = lang === "es";

    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl text-foreground">{isNew ? "New service" : `Edit: ${editing.title || "service"}`}</h3>
            {!isNew && <p className="font-body text-xs text-muted-foreground mt-0.5">Changes go live on the website as soon as you save.</p>}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && website && editing.is_active && (
              <Button asChild variant="outline" size="sm">
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> View on website
                </a>
              </Button>
            )}
            <button onClick={closeEditor} aria-label="Close" className="p-1.5 rounded-lg hover:bg-muted">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {pkg && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-body">
            <Package className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>
              This is the bookable item for the Spa Package <strong>{pkg.name}</strong>. Saving here also updates the package's name, price and visibility on the website.
              The treatments listed inside the package are edited in <strong>Spa Packages</strong>.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: main fields */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Category</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {categoryOptions(services, editing.category).map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Type</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body capitalize"
                  value={editing.type || "treatment"}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                >
                  {[...new Set([...SERVICE_TYPES, editing.type || "treatment"])].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Price ($ USD)</label>
                <Input type="number" step="1" min="0" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Duration (min)</label>
                <Input type="number" min="0" value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} />
              </div>
            </div>

            {problem && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-body text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{problem}. Booking time slots use the duration, so the name must say the same (e.g. "(60min)").</span>
              </div>
            )}

            {/* Texts, in English and Spanish */}
            <div className="rounded-xl border border-border">
              <div className="flex items-center gap-1 border-b border-border p-1.5">
                {(["en", "es"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-body text-sm font-medium transition-colors",
                      lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {l === "en" ? "English" : "Español"}
                  </button>
                ))}
                {es && (
                  <span className="ml-auto pr-2 font-body text-[11px] text-muted-foreground">
                    Leave a field empty to show the English text on the Spanish site.
                  </span>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
                    {es ? "Nombre (español)" : "Name *"}
                  </label>
                  <Input
                    value={es ? editing.title_es ?? "" : editing.title}
                    placeholder={es ? editing.title : ""}
                    onChange={(e) => setEditing(es ? { ...editing, title_es: e.target.value } : { ...editing, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
                    {es ? "Descripción corta" : "Short description"}
                  </label>
                  <textarea
                    value={es ? editing.description_es ?? "" : editing.description ?? ""}
                    placeholder={es ? editing.description ?? "" : ""}
                    onChange={(e) => setEditing(es ? { ...editing, description_es: e.target.value } : { ...editing, description: e.target.value })}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body min-h-[88px]"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
                    {es ? "Descripción detallada" : "Detailed description"}
                  </label>
                  <RichTextEditor
                    key={lang}
                    value={(es ? editing.description_rich_es : editing.description_rich)?.html ?? ""}
                    onChange={(html) =>
                      setEditing(es
                        ? { ...editing, description_rich_es: { html, type: "doc" } }
                        : { ...editing, description_rich: { html, type: "doc" } })
                    }
                    placeholder={es ? "Descripción completa…" : "Full service description..."}
                    onImageRequest={() => new Promise((resolve) => {
                      (window as any).__rtImageResolve = (url: string) => resolve(url);
                      setPickerOpen("rt");
                    })}
                  />
                </div>
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
              <h4 className="font-heading text-sm font-medium text-foreground">Visibility</h4>
              <label className="flex items-start gap-3 text-sm font-body">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <span>
                  Show on the website
                  <span className="block text-xs text-muted-foreground">Off hides it everywhere and it can't be booked. Nothing is deleted.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm font-body">
                <input type="checkbox" className="mt-1" checked={editing.request_only ?? false} onChange={(e) => setEditing({ ...editing, request_only: e.target.checked })} />
                <span>
                  Request only
                  <span className="block text-xs text-muted-foreground">No online calendar — sends clients to the request form (for limited therapist availability).</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm font-body">
                <input type="checkbox" className="mt-1" checked={editing.location_available ?? true} onChange={(e) => setEditing({ ...editing, location_available: e.target.checked })} />
                <span>
                  Available at your location
                  <span className="block text-xs text-muted-foreground">Lets guests request this treatment as an in-home / on-location visit. Turn off for treatments that need studio equipment.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm font-body">
                <input type="checkbox" className="mt-1" checked={editing.is_addon} onChange={(e) => setEditing({ ...editing, is_addon: e.target.checked })} />
                <span>
                  Add-on extra
                  <span className="block text-xs text-muted-foreground">Offered as an extra inside a booking, not listed on its own.</span>
                </span>
              </label>
              {/* Extras this treatment already includes: not offered with it. */}
              {!editing.is_addon && services.some((s) => s.is_addon && s.id !== editing.id) && (
                <div className="space-y-1.5">
                  <p className="font-body text-sm text-foreground">
                    Extras already included
                    <span className="block text-xs text-muted-foreground">Ticked extras are not offered with this treatment when guests book it.</span>
                  </p>
                  {services.filter((s) => s.is_addon && s.id !== editing.id).map((a) => {
                    const on = (editing.included_addon_ids ?? []).includes(a.id);
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm font-body">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setEditing({
                            ...editing,
                            included_addon_ids: e.target.checked
                              ? [...(editing.included_addon_ids ?? []), a.id]
                              : (editing.included_addon_ids ?? []).filter((id) => id !== a.id),
                          })}
                        />
                        {a.title}
                      </label>
                    );
                  })}
                </div>
              )}
              <div>
                <label className="font-body text-xs font-medium text-muted-foreground mb-1 block">Order in its category (lower shows first)</label>
                <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-heading text-sm font-medium text-foreground">Cover image</h4>
              {editing.image_url ? (
                <div className="relative">
                  <img src={editing.image_url} alt="" className="w-full aspect-video object-cover rounded-lg" />
                  <button onClick={() => setEditing({ ...editing, image_url: null })} aria-label="Remove image" className="absolute top-2 right-2 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground">
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
              <TagsInput contentTable="services" contentId={editing.id} />
            </div>

            <RelationshipsEditor sourceTable="services" sourceId={editing.id} targetTable="products" relationType="related" title="Linked products" />
            <RelationshipsEditor sourceTable="services" sourceId={editing.id} targetTable="retreats" relationType="related" title="Linked retreats" />
            <RelationshipsEditor sourceTable="services" sourceId={editing.id} targetTable="blog_posts" relationType="related" title="Related articles" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
          <Button variant="ghost" onClick={closeEditor}>Cancel</Button>
          {!isNew && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDelete({ id: editing.id!, title: editing.title })}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          )}
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

  // ─────────────────────────── List ───────────────────────────
  const totalCount = services.length + other.rows.length;
  const activeCount = services.filter((s) => s.is_active).length + other.rows.filter((r) => r.active).length;
  const countIn = (c: string) => services.filter((s) => s.category === c).length;
  const issues = services.filter((s) => validateServiceTitle(s)).length;
  const filtersOn = query || category !== "all" || status !== "all" || tagFilter.length > 0;

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-medium text-foreground">Services</h3>
            <p className="font-body text-xs text-muted-foreground">
              {totalCount} things we offer · {activeCount} on the website · {totalCount - activeCount} hidden
            </p>
          </div>
          <Button variant="default" size="sm" onClick={() => setEditing({ ...emptyService, category: category !== "all" && !EXTRA_CATEGORIES.includes(category) ? category : emptyService.category })}>
            <Plus className="h-4 w-4 mr-1" /> Add service
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, in English or Spanish…" className="pl-9" />
          </div>
          <select
            aria-label="Category"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-body"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories ({totalCount})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)} ({countIn(c)})</option>
            ))}
            {EXTRA_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c} ({other.rows.filter((r) => r.category === c).length})</option>
            ))}
          </select>
          <select
            aria-label="Status"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-body"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">On & hidden</option>
            <option value="active">On the website</option>
            <option value="inactive">Hidden</option>
          </select>
          <TagFilter contentTable="services" value={tagFilter} onChange={setTagFilter} />
          {filtersOn && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setCategory("all"); setStatus("all"); setTagFilter([]); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {issues > 0 && (
        <div className="px-5 py-3 bg-destructive/10 border-b border-destructive/30 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="font-body text-destructive">
            <strong>{issues} service{issues === 1 ? "" : "s"}</strong> have a name that doesn't match the duration — marked below.
          </p>
        </div>
      )}

      <div className="divide-y divide-border">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading services…</p>
        ) : visible.length === 0 && visibleExtras.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No services match. Try another search or clear the filters.</p>
        ) : (
          visible.map((s) => {
            const tagIds = tagsByContentId[s.id] ?? [];
            const problem = validateServiceTitle(s);
            const website = serviceWebsitePath(s);
            const pkg = packageFor(s.id);
            return (
              <div key={s.id} className={cn("flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors", !s.is_active && "opacity-70")}>
                <button onClick={() => setEditing(s)} className="shrink-0" aria-label={`Edit ${s.title}`}>
                  {s.image_url ? (
                    <img src={s.image_url} alt="" className="w-16 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                </button>

                <button onClick={() => setEditing(s)} className="flex-1 min-w-0 text-left">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-body text-sm font-medium text-foreground truncate">{s.title}</p>
                    {s.type && typeLabel[s.type] && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-primary/10 text-primary">{typeLabel[s.type]}</span>
                    )}
                    {s.is_addon && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-sky-500/15 text-sky-700">Add-on</span>}
                    {pkg && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-violet-500/15 text-violet-700">Package</span>}
                    {s.request_only && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-amber-500/15 text-amber-700">Request only</span>}
                    {s.location_available === false && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-stone-500/15 text-stone-600">Studio only</span>}
                    {!s.title_es && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body bg-muted text-muted-foreground">No Spanish name</span>}
                    {problem && (
                      <span title={problem} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-body bg-destructive/15 text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Name/duration
                      </span>
                    )}
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    {categoryLabel(s.category)} · {s.duration_minutes} min · {formatCRCWithUsd(s.price)}
                  </p>
                  {problem && <p className="font-body text-[11px] text-destructive mt-0.5">{problem}</p>}
                  {tagIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tagIds.map((id) => {
                        const t = tagLookup[id];
                        if (!t) return null;
                        return (
                          <span key={id} className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-body" style={{ backgroundColor: t.color ?? "hsl(var(--muted))", color: t.color ? "white" : undefined }}>
                            {t.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>

                <label className="hidden sm:flex items-center gap-2 text-xs font-body text-muted-foreground" title={s.is_active ? "Shown on the website" : "Hidden from the website"}>
                  <Switch checked={s.is_active} onCheckedChange={(v) => setActive(s, v)} aria-label={`Show ${s.title} on the website`} />
                  <span className="w-12">{s.is_active ? "On" : "Hidden"}</span>
                </label>
                {website && s.is_active ? (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-muted rounded-lg" title="View on website" aria-label={`View ${s.title} on the website`}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ) : (
                  <span className="w-8" />
                )}
                <button onClick={() => setEditing(s)} className="p-2 hover:bg-muted rounded-lg" title="Edit" aria-label={`Edit ${s.title}`}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            );
          })
        )}
        {!loading && !other.loading && visibleExtras.map((row) => (
          <ExtraRowItem key={row.key} row={row} onEdit={() => openExtra(row)} />
        ))}
      </div>
    </div>
  );
}
