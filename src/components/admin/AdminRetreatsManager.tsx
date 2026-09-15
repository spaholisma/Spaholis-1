import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, CalendarDays, ExternalLink, Image as ImageIcon, Loader2, Mail, Phone, Plus, Tent, Trash2, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ItineraryDay, PricingTier } from "@/hooks/useRetreats";
import {
  INQUIRY_STATUSES, isValidSlug, moveItem, newRetreatDraft, newSeason, renumberItinerary, retreatPayload,
  slugify, startingPrice, toRetreatDraft, type RetreatDraft,
} from "@/lib/adminRetreats";
import { GalleryEditor } from "./GalleryEditor";
import { MediaPickerDialog } from "./MediaLibrary";

interface Inquiry {
  id: string;
  retreat_id: string | null;
  retreat_title: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_start_date: string | null;
  number_of_guests: number | null;
  occupancy_type: string | null;
  with_accommodation: boolean | null;
  message: string | null;
  status: string;
  created_at: string;
}

type Section = "basics" | "included" | "itinerary" | "prices" | "policies";
type Lang = "en" | "es";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "included", label: "What's included" },
  { id: "itinerary", label: "Itinerary" },
  { id: "prices", label: "Prices" },
  { id: "policies", label: "Deposit & policies" },
];

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-red-100 text-red-800",
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const inquiriesTable = () => supabase.from("retreat_inquiries" as any) as any;

export function AdminRetreatsManager() {
  const [view, setView] = useState<"retreats" | "inquiries">("retreats");
  const [retreats, setRetreats] = useState<RetreatDraft[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RetreatDraft | null>(null);
  const [original, setOriginal] = useState("");

  const load = useCallback(async () => {
    const [{ data, error }, { data: inq }] = await Promise.all([
      supabase.from("retreats").select("*").order("sort_order"),
      inquiriesTable().select("*").order("created_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    setRetreats(((data as any[]) ?? []).map(toRetreatDraft));
    setInquiries((inq as Inquiry[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = (d: RetreatDraft) => {
    setEditing(d);
    setOriginal(JSON.stringify(d));
  };

  const setActive = async (r: RetreatDraft, active: boolean) => {
    setRetreats((list) => list.map((x) => (x.id === r.id ? { ...x, is_active: active } : x)));
    const { error } = await supabase.from("retreats").update({ is_active: active }).eq("id", r.id!);
    if (error) { toast.error(error.message); load(); return; }
    toast.success(active ? `"${r.title}" is visible on the website` : `"${r.title}" is hidden from the website`);
  };

  const newCount = inquiries.filter((i) => i.status === "new").length;

  if (editing) {
    return (
      <RetreatEditor
        draft={editing}
        onChange={setEditing}
        dirty={JSON.stringify(editing) !== original}
        others={retreats.filter((r) => r.id !== editing.id)}
        onSaved={(saved) => { open(saved); load(); }}
        onClose={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["retreats", `Retreats (${retreats.length})`],
          ["inquiries", "Inquiries"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 font-body text-sm font-medium transition-colors",
              view === id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {id === "inquiries" && newCount > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">{newCount} new</span>
            )}
          </button>
        ))}
      </div>

      {view === "retreats" ? (
        <div className="bg-card rounded-2xl border border-border">
          <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-medium text-foreground">Retreats</h3>
              <p className="font-body text-xs text-muted-foreground">
                The multi-day retreats on the Retreats page. Wellness Programs and Manuel Antonio Experiences are edited in <strong>Services</strong>.
              </p>
            </div>
            <Button size="sm" onClick={() => open(newRetreatDraft((retreats.at(-1)?.sort_order ?? 0) + 1))}>
              <Plus className="h-4 w-4 mr-1" /> Add retreat
            </Button>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <p className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading…</p>
            ) : retreats.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No retreats yet.</p>
            ) : (
              retreats.map((r) => {
                const from = startingPrice(r.pricing_tiers);
                return (
                  <div key={r.id} className={cn("flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors", !r.is_active && "opacity-70")}>
                    <button onClick={() => open(r)} className="shrink-0" aria-label={`Edit ${r.title}`}>
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="w-24 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-24 h-16 rounded-lg bg-muted flex items-center justify-center"><Tent className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                    </button>
                    <button onClick={() => open(r)} className="flex-1 min-w-0 text-left">
                      <p className="font-body text-sm font-medium text-foreground truncate">{r.title}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {r.duration_days} days{from ? ` · from ${usd(from)}` : ""} · {r.itinerary.length} itinerary days · {r.inclusions.length} inclusions
                      </p>
                      {r.itinerary_es.length === 0 && r.inclusions_es.length === 0 && (
                        <p className="font-body text-[11px] text-muted-foreground mt-0.5">Spanish itinerary and inclusions not added yet (English is shown)</p>
                      )}
                    </button>
                    <label className="hidden sm:flex items-center gap-2 text-xs font-body text-muted-foreground">
                      <Switch checked={r.is_active} onCheckedChange={(v) => setActive(r, v)} aria-label={`Show ${r.title} on the website`} />
                      <span className="w-12">{r.is_active ? "On" : "Hidden"}</span>
                    </label>
                    {r.is_active ? (
                      <a href={`/retreats/${r.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-muted rounded-lg" title="View on website">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    ) : <span className="w-8" />}
                    <Button variant="outline" size="sm" onClick={() => open(r)}>Edit</Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <InquiriesPanel inquiries={inquiries} onChanged={load} />
      )}
    </div>
  );
}

// ─────────────────────────── Editor ───────────────────────────

function RetreatEditor({
  draft, onChange, dirty, others, onSaved, onClose,
}: {
  draft: RetreatDraft;
  onChange: (d: RetreatDraft) => void;
  dirty: boolean;
  others: RetreatDraft[];
  onSaved: (d: RetreatDraft) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("basics");
  const [lang, setLang] = useState<Lang>("en");
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const isNew = !draft.id;
  const es = lang === "es";
  const set = (patch: Partial<RetreatDraft>) => onChange({ ...draft, ...patch });
  const from = startingPrice(draft.pricing_tiers);

  const close = () => {
    if (dirty && !confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  };

  const save = async () => {
    const payload = retreatPayload(isNew && !draft.slug ? { ...draft, slug: slugify(draft.title) } : draft);
    if (!payload.title) { toast.error("The English name is required"); setSection("basics"); setLang("en"); return; }
    if (!isValidSlug(payload.slug)) { toast.error("The web address can only use lowercase letters, numbers and dashes"); setSection("basics"); return; }
    if (others.some((r) => r.slug === payload.slug)) { toast.error("Another retreat already uses this web address"); setSection("basics"); return; }

    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await supabase.from("retreats").insert(payload as any).select().single();
        if (error) throw error;
        toast.success("Retreat created. It stays hidden until you turn on \"Show on the website\".");
        onSaved(toRetreatDraft(data));
      } else {
        const { data, error } = await supabase.from("retreats").update(payload as any).eq("id", draft.id!).select().single();
        if (error) throw error;
        toast.success(draft.is_active ? `"${payload.title}" saved — it's live on the website` : `"${payload.title}" saved`);
        onSaved(toRetreatDraft(data));
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const textSection = section !== "prices";

  return (
    <div className="bg-card rounded-2xl border border-border">
      {/* Header */}
      <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{isNew ? "New retreat" : "Edit retreat"}</p>
          <h3 className="font-heading text-xl text-foreground truncate">{draft.title || "Untitled retreat"}</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && draft.is_active && (
            <Button asChild variant="outline" size="sm">
              <a href={`/retreats/${draft.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" /> View on website</a>
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
          <button onClick={close} aria-label="Close" className="p-1.5 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
      </div>

      {/* Section tabs + language */}
      <div className="px-5 pt-4 flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "rounded-full px-4 py-1.5 font-body text-sm font-medium transition-colors",
              section === s.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
        {textSection && (
          <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-1">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn("rounded-full px-3 py-1 font-body text-xs font-semibold", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
        )}
      </div>
      {textSection && es && (
        <p className="px-5 pt-2 font-body text-xs text-muted-foreground">
          Anything left empty in Spanish shows the English text on the Spanish site.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">
        <div className="lg:col-span-2 space-y-5">
          {section === "basics" && (
            <>
              <Field label={es ? "Nombre (español)" : "Name *"}>
                <Input
                  value={es ? draft.title_es ?? "" : draft.title}
                  placeholder={es ? draft.title : "e.g. 4-Day Beach & Yoga Retreat"}
                  onChange={(e) => set(es ? { title_es: e.target.value } : { title: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })}
                />
              </Field>
              <Field label={es ? "Descripción corta (tarjeta)" : "Short description (shown on the card)"}>
                <Textarea
                  rows={3}
                  value={es ? draft.short_description_es ?? "" : draft.short_description ?? ""}
                  placeholder={es ? draft.short_description ?? "" : ""}
                  onChange={(v) => set(es ? { short_description_es: v } : { short_description: v })}
                />
              </Field>
              <Field label={es ? "Descripción completa" : "Full description (retreat page, Overview)"}>
                <Textarea
                  rows={7}
                  value={es ? draft.description_es ?? "" : draft.description ?? ""}
                  placeholder={es ? draft.description ?? "" : ""}
                  onChange={(v) => set(es ? { description_es: v } : { description: v })}
                />
              </Field>
              {!es && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Length (days)">
                    <Input type="number" min={1} value={draft.duration_days} onChange={(e) => set({ duration_days: Number(e.target.value) })} />
                  </Field>
                  <Field label="Web address" hint={isNew ? "Made from the name; you can change it." : "Changing it would break links already shared, so it's locked."}>
                    <div className="flex items-center rounded-lg border border-input bg-muted/40 pl-3 text-sm font-body text-muted-foreground">
                      /retreats/
                      <input
                        className="h-10 flex-1 bg-transparent px-1 text-foreground outline-none disabled:opacity-70"
                        value={draft.slug}
                        disabled={!isNew}
                        onChange={(e) => set({ slug: slugify(e.target.value) })}
                      />
                    </div>
                  </Field>
                </div>
              )}
              {!es && <GalleryEditor images={draft.gallery_images} onChange={(imgs) => set({ gallery_images: imgs })} label="Gallery (retreat page)" />}
            </>
          )}

          {section === "included" && (
            <>
              <SectionIntro title={es ? "Qué incluye" : "What's included"} text={es ? "Cada punto aparece con un check en la página del retiro." : "Each item shows with a check mark on the retreat page."} />
              {es && draft.inclusions_es.length === 0 && draft.inclusions.length > 0 ? (
                <StartTranslation onStart={() => set({ inclusions_es: [...draft.inclusions] })} />
              ) : (
                <ListEditor
                  items={es ? draft.inclusions_es : draft.inclusions}
                  onChange={(items) => set(es ? { inclusions_es: items } : { inclusions: items })}
                  placeholder={es ? "Ej. Hospedaje de 3 noches con desayuno" : "e.g. 3-night stay with daily breakfast"}
                  addLabel={es ? "Agregar punto" : "Add item"}
                />
              )}
            </>
          )}

          {section === "itinerary" && (
            <>
              <SectionIntro title={es ? "Itinerario" : "Itinerary"} text={es ? "Día por día. Los números se ponen solos." : "Day by day. Day numbers update on their own when you move or remove days."} />
              {es && draft.itinerary_es.length === 0 && draft.itinerary.length > 0 ? (
                <StartTranslation onStart={() => set({ itinerary_es: draft.itinerary.map((d) => ({ ...d, activities: [...(d.activities ?? [])] })) })} />
              ) : (
                <ItineraryEditor
                  days={es ? draft.itinerary_es : draft.itinerary}
                  es={es}
                  onChange={(days) => set(es ? { itinerary_es: days } : { itinerary: days })}
                />
              )}
            </>
          )}

          {section === "prices" && (
            <>
              <SectionIntro title="Prices" text={`In USD, taxes included. The website card shows "From" the lowest price${from ? ` — now ${usd(from)}` : ""}.`} />
              <PricingEditor tiers={draft.pricing_tiers} onChange={(t) => set({ pricing_tiers: t })} />
            </>
          )}

          {section === "policies" && (
            <>
              {!es && (
                <Field label="Deposit to reserve (%)">
                  <Input type="number" min={0} max={100} className="max-w-[160px]" value={draft.deposit_percentage} onChange={(e) => set({ deposit_percentage: Number(e.target.value) })} />
                </Field>
              )}
              <Field label={es ? "Políticas de reserva (español)" : "Booking policies (shown under the prices)"}>
                <Textarea
                  rows={6}
                  value={es ? draft.booking_policies_es ?? "" : draft.booking_policies ?? ""}
                  placeholder={es ? draft.booking_policies ?? "" : ""}
                  onChange={(v) => set(es ? { booking_policies_es: v } : { booking_policies: v })}
                />
              </Field>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border p-4 space-y-4">
            <h4 className="font-heading text-sm font-medium text-foreground">Visibility</h4>
            <label className="flex items-start gap-3 text-sm font-body">
              <Switch checked={draft.is_active} onCheckedChange={(v) => set({ is_active: v })} />
              <span>
                Show on the website
                <span className="block text-xs text-muted-foreground">Off hides the retreat and its page. Nothing is deleted.</span>
              </span>
            </label>
            <Field label="Order on the Retreats page (lower shows first)">
              <Input type="number" value={draft.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <h4 className="font-heading text-sm font-medium text-foreground">Main photo</h4>
            {draft.image_url ? (
              <div className="relative">
                <img src={draft.image_url} alt="" className="w-full aspect-video object-cover rounded-lg" />
                <button onClick={() => set({ image_url: null })} aria-label="Remove photo" className="absolute top-2 right-2 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-muted/40 flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>
            )}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPicker(true)}>Choose from Media Library</Button>
          </div>

          {/* Card preview */}
          <div className="rounded-xl border border-border overflow-hidden">
            <p className="px-4 pt-3 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Card preview</p>
            <div className="m-3 rounded-xl border border-border overflow-hidden bg-background">
              {draft.image_url && <img src={draft.image_url} alt="" className="aspect-[16/10] w-full object-cover" />}
              <div className="p-4 space-y-1.5">
                <p className="flex items-center gap-1 font-body text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" /> {draft.duration_days} days</p>
                <p className="font-heading text-base text-foreground">{(es && draft.title_es) || draft.title || "Retreat name"}</p>
                <p className="font-body text-xs text-muted-foreground line-clamp-2">{(es && draft.short_description_es) || draft.short_description}</p>
                {from && <p className="font-heading text-sm font-semibold text-foreground">From {usd(from)} <span className="font-body text-[10px] font-normal text-muted-foreground">USD</span></p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-border flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
        <Button variant="ghost" onClick={close}>Close</Button>
        {dirty && <span className="font-body text-xs text-amber-700">Unsaved changes</span>}
      </div>

      <MediaPickerDialog
        open={picker}
        onOpenChange={(v) => { if (!v) setPicker(false); }}
        onSelect={(url) => { set({ image_url: url }); setPicker(false); }}
      />
    </div>
  );
}

// ─────────────────────────── Small editors ───────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="font-body text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Textarea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body leading-relaxed"
    />
  );
}

function SectionIntro({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h4 className="font-heading text-lg text-foreground">{title}</h4>
      <p className="font-body text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function StartTranslation({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
      <p className="font-body text-sm text-muted-foreground">No Spanish version yet — the Spanish site shows the English one.</p>
      <Button variant="outline" size="sm" onClick={onStart}>Start from the English text to translate it</Button>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("p-2 rounded-lg shrink-0 disabled:opacity-30 disabled:pointer-events-none", danger ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted")}
    >
      {children}
    </button>
  );
}

function ListEditor({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-6 text-right font-body text-xs text-muted-foreground shrink-0">{i + 1}.</span>
          <Input value={item} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <IconBtn label="Move up" disabled={i === 0} onClick={() => onChange(moveItem(items, i, i - 1))}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Move down" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, i + 1))}><ArrowDown className="h-4 w-4" /></IconBtn>
          <IconBtn label="Remove" danger onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconBtn>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="h-4 w-4 mr-1" /> {addLabel}
      </Button>
    </div>
  );
}

function ItineraryEditor({ days, onChange, es }: { days: ItineraryDay[]; onChange: (d: ItineraryDay[]) => void; es: boolean }) {
  const update = (i: number, patch: Partial<ItineraryDay>) => onChange(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-4">
      {days.map((d, i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center font-body text-xs font-semibold shrink-0">{i + 1}</span>
            <Input value={d.title ?? ""} placeholder={es ? "Título del día, ej. Llegada y bienvenida" : "Day title, e.g. Arrival & welcome"} onChange={(e) => update(i, { title: e.target.value })} />
            <IconBtn label="Move day up" disabled={i === 0} onClick={() => onChange(renumberItinerary(moveItem(days, i, i - 1)))}><ArrowUp className="h-4 w-4" /></IconBtn>
            <IconBtn label="Move day down" disabled={i === days.length - 1} onClick={() => onChange(renumberItinerary(moveItem(days, i, i + 1)))}><ArrowDown className="h-4 w-4" /></IconBtn>
            <IconBtn
              label="Remove day"
              danger
              onClick={() => { if (confirm(`Remove day ${i + 1}?`)) onChange(renumberItinerary(days.filter((_, j) => j !== i))); }}
            >
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
          <div className="sm:pl-10">
            <p className="font-body text-xs text-muted-foreground mb-2">{es ? "Actividades" : "Activities"}</p>
            <ListEditor
              items={d.activities ?? []}
              onChange={(a) => update(i, { activities: a })}
              placeholder={es ? "Ej. Clase de yoga al amanecer" : "e.g. Sunrise yoga class"}
              addLabel={es ? "Agregar actividad" : "Add activity"}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...days, { day: days.length + 1, title: "", activities: [""] }])}>
        <Plus className="h-4 w-4 mr-1" /> {es ? "Agregar día" : "Add day"}
      </Button>
    </div>
  );
}

type PriceRow = { occupancy: string; price: number };

function PriceRows({ rows, onChange, placeholder }: { rows: PriceRow[]; onChange: (r: PriceRow[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="flex-1" value={r.occupancy} placeholder={placeholder} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, occupancy: e.target.value } : x)))} />
          <div className="relative w-28 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input className="pl-6" type="number" min={0} value={r.price} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
          </div>
          <IconBtn label="Remove option" danger onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconBtn>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, { occupancy: "", price: 0 }])}>
        <Plus className="h-4 w-4 mr-1" /> Add option
      </Button>
    </div>
  );
}

function PricingEditor({ tiers, onChange }: { tiers: PricingTier[]; onChange: (t: PricingTier[]) => void }) {
  const update = (i: number, patch: Partial<PricingTier>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-5">
      {tiers.map((t, i) => (
        <div key={t.season || i} className="rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Input value={t.label} placeholder="Season name, e.g. High Season (Dec 21 – Apr 30)" onChange={(e) => update(i, { label: e.target.value })} className="font-medium" />
            <IconBtn label="Remove season" danger onClick={() => { if (confirm(`Remove "${t.label}" and its prices?`)) onChange(tiers.filter((_, j) => j !== i)); }}>
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">With accommodation</p>
              <PriceRows rows={t.with_accommodation ?? []} placeholder="e.g. single" onChange={(r) => update(i, { with_accommodation: r })} />
            </div>
            <div className="space-y-2">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Without accommodation</p>
              <PriceRows rows={t.without_accommodation ?? []} placeholder="e.g. 1 person" onChange={(r) => update(i, { without_accommodation: r })} />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...tiers, newSeason()])}>
        <Plus className="h-4 w-4 mr-1" /> Add season
      </Button>
    </div>
  );
}

// ─────────────────────────── Inquiries ───────────────────────────

function InquiriesPanel({ inquiries, onChanged }: { inquiries: Inquiry[]; onChanged: () => void }) {
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const visible = useMemo(() => inquiries.filter((i) => status === "all" || i.status === status), [inquiries, status]);

  const updateStatus = async (inq: Inquiry, next: string) => {
    const { error } = await inquiriesTable().update({ status: next }).eq("id", inq.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked as ${next}`);
    setSelected({ ...inq, status: next });
    onChanged();
  };

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Retreat inquiries</h3>
          <p className="font-body text-xs text-muted-foreground">Requests sent from each retreat's page. The team also gets an email for each new one.</p>
        </div>
        <select aria-label="Status" className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-body capitalize" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All ({inquiries.length})</option>
          {INQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>{s} ({inquiries.filter((i) => i.status === s).length})</option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No inquiries here.</p>
      ) : (
        <div className="divide-y divide-border">
          {visible.map((inq) => (
            <button key={inq.id} onClick={() => setSelected(inq)} className="w-full text-left flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-body text-sm font-medium text-foreground">{inq.first_name} {inq.last_name}</p>
                  <Badge className={cn("capitalize", statusColors[inq.status] || "")}>{inq.status}</Badge>
                </div>
                <p className="font-body text-xs text-muted-foreground truncate">{inq.retreat_title || "Retreat"} · {inq.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-body text-xs text-muted-foreground">{format(new Date(inq.created_at), "MMM d, yyyy")}</p>
                <p className="font-body text-[11px] text-muted-foreground">{inq.number_of_guests ?? 1} guest{(inq.number_of_guests ?? 1) === 1 ? "" : "s"}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <div className="space-y-5">
              <div>
                <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{selected.retreat_title || "Retreat inquiry"}</p>
                <DialogTitle className="font-heading text-xl font-medium text-foreground">{selected.first_name} {selected.last_name}</DialogTitle>
                <p className="font-body text-xs text-muted-foreground">Received {format(new Date(selected.created_at), "MMM d, yyyy · h:mm a")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${selected.email}?subject=${encodeURIComponent(`Your ${selected.retreat_title || "retreat"} inquiry`)}`}><Mail className="h-4 w-4 mr-1.5" /> {selected.email}</a>
                </Button>
                {selected.phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><Phone className="h-4 w-4 mr-1.5" /> {selected.phone}</a>
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm font-body">
                <Info label="Preferred start" value={selected.preferred_start_date ? format(new Date(`${selected.preferred_start_date}T12:00:00`), "MMM d, yyyy") : "—"} />
                <Info label="Guests" value={<span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {selected.number_of_guests ?? 1}</span>} />
                <Info label="Room" value={<span className="capitalize">{selected.occupancy_type || "—"}</span>} />
                <Info label="Accommodation" value={selected.with_accommodation === false ? "Without" : "With"} />
              </div>
              {selected.message && (
                <div>
                  <p className="text-xs text-muted-foreground font-body mb-1">Message</p>
                  <p className="text-sm font-body text-foreground whitespace-pre-line rounded-lg bg-muted/50 p-3">{selected.message}</p>
                </div>
              )}
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground font-body mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {INQUIRY_STATUSES.map((s) => (
                    <Button key={s} size="sm" variant={selected.status === s ? "default" : "outline"} className="capitalize text-xs" onClick={() => updateStatus(selected, s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
