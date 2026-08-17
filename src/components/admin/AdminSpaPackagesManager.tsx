import { useState } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  GripVertical, Save, Plus, X, ChevronDown, ChevronUp, Trash2, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSpaPackages, useSavePackage, useSavePackageItems,
  useCreatePackage, useDeletePackage, useReorderPackages,
  type SpaPackage, type SpaPackageItem,
} from "@/hooks/useSpaPackages";
import { RichTextEditor } from "./RichTextEditor";
import { GalleryEditor } from "./GalleryEditor";
import { TagsInput } from "./TagsInput";
import { RelationshipsEditor } from "./RelationshipsEditor";
import { MediaPickerDialog } from "./MediaLibrary";

function PackageCard({
  pkg,
  onSaveMeta,
  onSaveItems,
  onDelete,
}: {
  pkg: SpaPackage;
  onSaveMeta: (p: SpaPackage) => void;
  onSaveItems: (packageId: string, items: { treatment_name: string; position: number }[]) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [meta, setMeta] = useState({
    name: pkg.name,
    description: pkg.description || "",
    description_rich: (pkg.description_rich as any) ?? { html: "" },
    duration_label: pkg.duration_label || "",
    price: pkg.price,
    booking_url: pkg.booking_url || "",
    image_url: pkg.image_url || "",
    gallery_images: ((pkg.gallery_images as string[]) ?? []),
  });
  const [pickerOpen, setPickerOpen] = useState<null | "cover" | "rt">(null);
  const [items, setItems] = useState<{ treatment_name: string; position: number }[]>(
    pkg.items.map(i => ({ treatment_name: i.treatment_name, position: i.position }))
  );
  const [dirtyItems, setDirtyItems] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addItem = () => {
    setItems(prev => [...prev, { treatment_name: "", position: prev.length }]);
    setDirtyItems(true);
    if (!expanded) setExpanded(true);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, position: i })));
    setDirtyItems(true);
  };

  const updateItem = (idx: number, name: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, treatment_name: name } : it));
    setDirtyItems(true);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next.map((it, i) => ({ ...it, position: i }));
    });
    setDirtyItems(true);
    setDragIdx(null);
  };

  const handleSaveMeta = () => {
    onSaveMeta({ ...pkg, ...meta });
    setEditingMeta(false);
  };

  const handleSaveItems = () => {
    onSaveItems(pkg.id, items.filter(i => i.treatment_name.trim()));
    setDirtyItems(false);
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-base font-semibold text-foreground">{pkg.name}</h3>
            <p className="font-body text-xs text-muted-foreground">
              {pkg.duration_label} · {formatCRC(pkg.price)} · {pkg.items.length} treatments
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setEditingMeta(!editingMeta); if (!expanded) setExpanded(true); }}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Treatment
          </Button>
        </div>
      </div>

      {/* Meta editor */}
      {editingMeta && expanded && (
        <div className="p-4 border-b border-border bg-accent/5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Name</label>
              <Input value={meta.name} onChange={e => setMeta(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Duration</label>
              <Input value={meta.duration_label} onChange={e => setMeta(p => ({ ...p, duration_label: e.target.value }))} placeholder="e.g. 2 Hours" />
            </div>
          </div>
          <div>
            <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Short description</label>
            <Textarea value={meta.description} onChange={e => setMeta(p => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div>
            <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Detailed description</label>
            <RichTextEditor
              value={(meta.description_rich as any)?.html ?? ""}
              onChange={(html) => setMeta(p => ({ ...p, description_rich: { html, type: "doc" } }))}
              placeholder="Full package description..."
              onImageRequest={() => new Promise((resolve) => {
                (window as any).__rtImageResolve = (url: string) => resolve(url);
                setPickerOpen("rt");
              })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Price ($ USD)</label>
              <Input type="number" value={meta.price} onChange={e => setMeta(p => ({ ...p, price: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-body font-medium text-muted-foreground mb-1 block">Booking URL</label>
              <Input value={meta.booking_url} onChange={e => setMeta(p => ({ ...p, booking_url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <h5 className="text-xs font-medium text-foreground">Cover image</h5>
              {meta.image_url ? (
                <div className="relative">
                  <img src={meta.image_url} alt="" className="w-full aspect-video object-cover rounded" />
                  <button onClick={() => setMeta(p => ({ ...p, image_url: "" }))} className="absolute top-1 right-1 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="aspect-video rounded bg-muted/40" />
              )}
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setPickerOpen("cover")}>
                Choose cover
              </Button>
            </div>
            <GalleryEditor
              images={meta.gallery_images}
              onChange={(imgs) => setMeta(p => ({ ...p, gallery_images: imgs }))}
            />
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <h5 className="text-xs font-medium text-foreground">Tags</h5>
            <TagsInput contentTable="spa_packages" contentId={pkg.id} />
          </div>
          <RelationshipsEditor
            sourceTable="spa_packages"
            sourceId={pkg.id}
            targetTable="services"
            relationType="related"
            title="Linked services"
          />
          <RelationshipsEditor
            sourceTable="spa_packages"
            sourceId={pkg.id}
            targetTable="products"
            relationType="related"
            title="Linked products"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveMeta}>Save Package Info</Button>
            <Button size="sm" variant="destructive" onClick={() => { if (confirm("Delete this package and all its treatments?")) onDelete(pkg.id); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>

          <MediaPickerDialog
            open={pickerOpen !== null}
            onOpenChange={(v) => { if (!v) setPickerOpen(null); }}
            onSelect={(url) => {
              if (pickerOpen === "cover") setMeta(p => ({ ...p, image_url: url }));
              else if (pickerOpen === "rt") {
                const fn = (window as any).__rtImageResolve;
                if (fn) { fn(url); (window as any).__rtImageResolve = null; }
              }
              setPickerOpen(null);
            }}
          />
        </div>
      )}

      {/* Items list */}
      {expanded && (
        <div className="divide-y divide-border">
          {items.length === 0 && (
            <p className="p-4 text-center font-body text-sm text-muted-foreground italic">No treatments — click + Treatment to add</p>
          )}
          {items.map((item, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.stopPropagation(); handleDrop(idx); }}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-grab active:cursor-grabbing",
                dragIdx === idx && "opacity-40"
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <span className="font-body text-xs text-muted-foreground w-5">{idx + 1}.</span>
              <Input
                className="flex-1 h-8 text-sm"
                value={item.treatment_name}
                onChange={e => updateItem(idx, e.target.value)}
                placeholder="Treatment name..."
              />
              <button onClick={() => removeItem(idx)} className="p-1 hover:bg-destructive/10 rounded-lg shrink-0">
                <X className="h-3.5 w-3.5 text-destructive/60" />
              </button>
            </div>
          ))}
          {dirtyItems && (
            <div className="p-3 flex justify-end">
              <Button size="sm" onClick={handleSaveItems}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save Treatments
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminSpaPackagesManager() {
  const { data: packages, isLoading } = useSpaPackages();
  const saveMeta = useSavePackage();
  const saveItems = useSavePackageItems();
  const createPkg = useCreatePackage();
  const deletePkg = useDeletePackage();
  const reorder = useReorderPackages();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [orderedPkgs, setOrderedPkgs] = useState<SpaPackage[] | null>(null);

  const displayPkgs = orderedPkgs || packages || [];

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
    if (!orderedPkgs) setOrderedPkgs([...displayPkgs]);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const next = [...displayPkgs];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setOrderedPkgs(next);
    setDragIdx(null);
  };

  const saveOrder = () => {
    if (!orderedPkgs) return;
    reorder.mutate(orderedPkgs.map((p, i) => ({ id: p.id, position: i })));
    setOrderedPkgs(null);
  };

  if (isLoading) return <p className="text-muted-foreground p-8">Loading packages…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Spa Packages</h2>
          <p className="text-sm text-muted-foreground">
            Manage spa packages and their included treatments. Drag to reorder packages.
          </p>
        </div>
        <div className="flex gap-2">
          {orderedPkgs && (
            <Button size="sm" onClick={saveOrder} disabled={reorder.isPending}>
              <Save className="h-4 w-4 mr-1" /> Save Order
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Package
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-xl border border-border">
          <Input className="flex-1" placeholder="Package name" value={newName} onChange={e => setNewName(e.target.value)} />
          <Button size="sm" onClick={() => {
            createPkg.mutate({ name: newName, position: displayPkgs.length });
            setNewName("");
            setShowCreate(false);
          }}>Create</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
        </div>
      )}

      <div className="space-y-4">
        {displayPkgs.map((pkg, idx) => (
          <div
            key={pkg.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={() => handleDrop(idx)}
            className={cn(dragIdx === idx && "opacity-40")}
          >
            <PackageCard
              pkg={pkg}
              onSaveMeta={p => saveMeta.mutate(p)}
              onSaveItems={(pId, items) => saveItems.mutate({ packageId: pId, items })}
              onDelete={id => deletePkg.mutate(id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
