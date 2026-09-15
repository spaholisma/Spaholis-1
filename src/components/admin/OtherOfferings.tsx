import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowRight, ArrowUp, ExternalLink, Image as ImageIcon, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { content as defaults } from "@/data/content";
import { moveItem } from "@/lib/adminRetreats";
import {
  buildExtraRows, completeEsList, getIn, parseRatePrice, privatePriceUsd, privatePricing, setIn,
  type ContentPair, type ExtraRow, type PrivatePricing,
} from "@/lib/otherOfferings";
import { MediaPickerDialog } from "./MediaLibrary";

type Lang = "en" | "es";

// ─────────────────────────── Content read / write ───────────────────────────

async function loadContent(): Promise<ContentPair> {
  const [{ data: en, error: e1 }, { data: es, error: e2 }] = await Promise.all([
    supabase.from("site_content").select("content").eq("section_key", "content").maybeSingle(),
    supabase.from("site_content").select("content").eq("section_key", "content_es").maybeSingle(),
  ]);
  if (e1 || e2) throw e1 || e2;
  return { en: (en?.content as any) ?? {}, es: (es?.content as any) ?? {} };
}

/**
 * Re-reads the latest content right before writing and changes only the
 * fields being edited, so anything saved from the Content editor is kept.
 * Refuses to write if the current content can't be read.
 */
async function saveContent(change: (c: ContentPair) => ContentPair) {
  const [{ data: en, error: e1 }, { data: es, error: e2 }] = await Promise.all([
    supabase.from("site_content").select("content").eq("section_key", "content").maybeSingle(),
    supabase.from("site_content").select("content").eq("section_key", "content_es").maybeSingle(),
  ]);
  if (e1 || e2) throw e1 || e2;
  if (!en?.content || !es?.content) throw new Error("Could not read the current website texts, so nothing was saved. Please try again.");
  const next = change({ en: en.content as any, es: es.content as any });
  const now = new Date().toISOString();
  const { error: w1 } = await supabase.from("site_content").update({ content: next.en as any, updated_at: now }).eq("section_key", "content");
  if (w1) throw w1;
  const { error: w2 } = await supabase.from("site_content").update({ content: next.es as any, updated_at: now }).eq("section_key", "content_es");
  if (w2) throw w2;
}

export function useOtherOfferings() {
  const [rows, setRows] = useState<ExtraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const [content, { data: offerings }, { data: retreats }] = await Promise.all([
        loadContent(),
        supabase.from("offerings").select("id, name, type, price, status, sort_order").order("sort_order"),
        supabase.from("retreats").select("id, title, slug, duration_days, image_url, is_active, pricing_tiers, sort_order").order("sort_order"),
      ]);
      setRows(buildExtraRows(content, (offerings as any[]) ?? [], (retreats as any[]) ?? []));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load private classes, rates and signature cards");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { rows, loading, reload };
}

export const opensOwnEditor = (row: ExtraRow) => row.kind === "membership" || row.kind === "retreat";

export function openOwnEditor(row: ExtraRow) {
  window.dispatchEvent(new CustomEvent("admin-tab", { detail: row.kind === "membership" ? "offerings" : "retreats" }));
}

// ─────────────────────────── List row ───────────────────────────

export function ExtraRowItem({ row, onEdit }: { row: ExtraRow; onEdit: () => void }) {
  const own = opensOwnEditor(row);
  return (
    <div className={cn("flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors", !row.active && "opacity-70")}>
      <button onClick={onEdit} className="shrink-0" aria-label={`Edit ${row.title}`}>
        {row.image ? (
          <img src={row.image} alt="" className="w-16 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
        )}
      </button>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-body text-sm font-medium text-foreground truncate">{row.title}</p>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body font-semibold bg-emerald-500/15 text-emerald-700">{row.badge}</span>
          {!row.active && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-body bg-muted text-muted-foreground">Hidden</span>}
        </div>
        <p className="font-body text-xs text-muted-foreground truncate">{row.category} · {row.subtitle}</p>
      </button>
      {row.websitePath && row.active ? (
        <a href={row.websitePath} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-muted rounded-lg" title="View on website" aria-label={`View ${row.title} on the website`}>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </a>
      ) : <span className="w-8" />}
      <Button variant="outline" size="sm" onClick={onEdit}>
        {own ? <>Open editor <ArrowRight className="h-3.5 w-3.5 ml-1" /></> : "Edit"}
      </Button>
    </div>
  );
}

// ─────────────────────────── Editors ───────────────────────────

export function ExtraEditor({ row, services, onClose }: { row: ExtraRow; services: { id: string; title: string; category: string }[]; onClose: () => void }) {
  if (row.kind === "private") return <PrivateClassEditor row={row} onClose={onClose} />;
  if (row.kind === "studio") return <StudioRentalEditor onClose={onClose} />;
  if (row.kind === "sigHome") return <SignatureHomeEditor index={row.index ?? 0} services={services} onClose={onClose} />;
  return <SignaturePageEditor index={row.index ?? 0} onClose={onClose} />;
}

function Shell({
  eyebrow, title, websitePath, note, lang, setLang, saving, onSave, onClose, children,
}: {
  eyebrow: string; title: string; websitePath: string; note?: ReactNode;
  lang?: Lang; setLang?: (l: Lang) => void; saving: boolean; onSave: () => void; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          <h3 className="font-heading text-xl text-foreground truncate">{title || "Untitled"}</h3>
          <p className="font-body text-xs text-muted-foreground mt-0.5">Changes go live on the website as soon as you save.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={websitePath} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" /> View on website</a>
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
      </div>
      {note && <div className="mx-5 mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-body">{note}</div>}
      {lang && setLang && (
        <div className="px-5 pt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {(["en", "es"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cn("rounded-full px-3 py-1 font-body text-xs font-semibold", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
          {lang === "es" && <span className="font-body text-xs text-muted-foreground">Anything left empty shows the English text on the Spanish site.</span>}
        </div>
      )}
      <div className="p-5 space-y-5">{children}</div>
      <div className="px-5 py-4 border-t border-border flex items-center gap-3">
        <Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="font-body text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
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

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 max-w-sm">
      {value ? (
        <div className="relative">
          <img src={value} alt="" className="w-full aspect-video object-cover rounded-lg" />
          <button onClick={() => onChange("")} aria-label="Remove photo" className="absolute top-2 right-2 p-1 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="aspect-video rounded-lg bg-muted/40 flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Choose from Media Library</Button>
      <MediaPickerDialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }} onSelect={(url) => { onChange(url); setOpen(false); }} />
    </div>
  );
}

function useLoaded<T>(read: (c: ContentPair) => T, onClose: () => void) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    loadContent().then((c) => setValue(read(c))).catch((e) => { toast.error(e.message ?? "Could not load"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [value, setValue] as const;
}

function useSaver(onClose: () => void) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const run = async (label: string, change: (c: ContentPair) => ContentPair) => {
    setSaving(true);
    try {
      await saveContent(change);
      qc.invalidateQueries({ queryKey: ["site-content"] });
      toast.success(`${label} saved — it's live on the website`);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

const Loading = () => (
  <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
    <Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> Loading…
  </div>
);

// Private class ────────────────────────────────────────────────

function PrivateClassEditor({ row, onClose }: { row: ExtraRow; onClose: () => void }) {
  const key = row.classKey!;
  const id = row.classId!;
  const base = ["privateSessions", "classes", key];
  const [lang, setLang] = useState<Lang>("en");
  const { saving, run } = useSaver(onClose);
  const [form, setForm] = useLoaded(({ en, es }) => ({
    title: String(getIn(en, [...base, "title"]) ?? getIn(defaults, [...base, "title"]) ?? ""),
    description: String(getIn(en, [...base, "description"]) ?? getIn(defaults, [...base, "description"]) ?? ""),
    title_es: String(getIn(es, [...base, "title"]) ?? ""),
    description_es: String(getIn(es, [...base, "description"]) ?? ""),
    image: String(getIn(en, ["privateSessions", "images", id]) ?? getIn(defaults, ["privateSessions", "images", id]) ?? ""),
    pricing: privatePricing({ pricing: getIn(en, ["privateSessions", "pricing"]) }),
  }), onClose);

  if (!form) return <Loading />;
  const es = lang === "es";
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const setPrice = (k: keyof PrivatePricing, v: string) => set({ pricing: { ...form.pricing, [k]: Math.max(0, Number(v) || 0) } });

  const save = () => {
    if (!form.title.trim()) { toast.error("The English name is required"); setLang("en"); return; }
    if (Object.values(form.pricing).some((p) => !(p > 0))) { toast.error("Every price must be more than $0"); return; }
    run(`"${form.title.trim()}"`, ({ en, es: esC }) => {
      let e = setIn(en, [...base, "title"], form.title.trim());
      e = setIn(e, [...base, "description"], form.description.trim());
      e = setIn(e, ["privateSessions", "images", id], form.image);
      e = setIn(e, ["privateSessions", "pricing"], form.pricing);
      let s = setIn(esC, [...base, "title"], form.title_es.trim());
      s = setIn(s, [...base, "description"], form.description_es.trim());
      return { en: e, es: s };
    });
  };

  return (
    <Shell
      eyebrow="Private class"
      title={form.title}
      websitePath="/private-sessions"
      lang={lang}
      setLang={setLang}
      saving={saving}
      onSave={save}
      onClose={onClose}
    >
      <Field label={es ? "Nombre (español)" : "Name *"}>
        <Input value={es ? form.title_es : form.title} placeholder={es ? form.title : ""} onChange={(e) => set(es ? { title_es: e.target.value } : { title: e.target.value })} />
      </Field>
      <Field label={es ? "Descripción (español)" : "Description"}>
        <TextArea value={es ? form.description_es : form.description} placeholder={es ? form.description : ""} onChange={(v) => set(es ? { description_es: v } : { description: v })} />
      </Field>
      {!es && (
        <>
          <Field label="Photo" hint="Leave empty to use the standard photo.">
            <ImageField value={form.image} onChange={(v) => set({ image: v })} />
          </Field>
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div>
              <h4 className="font-heading text-sm font-medium text-foreground">Private class prices (USD)</h4>
              <p className="font-body text-xs text-muted-foreground">Shared by all private classes and shown in the Pricing guide on the page.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ["onePerson", "1 person"],
                ["twoPeople", "2 people"],
                ["upToFour", "Up to 4 people"],
                ["extraPerson", "Each extra person"],
              ] as const).map(([k, label]) => (
                <Field key={k} label={label}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input className="pl-6" type="number" min={1} value={form.pricing[k]} onChange={(e) => setPrice(k, e.target.value)} />
                  </div>
                </Field>
              ))}
            </div>
            <p className="font-body text-xs text-muted-foreground">
              Example: a group of 6 pays ${privatePriceUsd(6, form.pricing)} (up to 4 + 2 extra people).
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}

// Studio rental rates ──────────────────────────────────────────

function StudioRentalEditor({ onClose }: { onClose: () => void }) {
  const { saving, run } = useSaver(onClose);
  const [rows, setRows] = useLoaded(({ en, es }) => {
    const enRates: any[] = getIn(en, ["studioRental", "rates"]) ?? getIn(defaults, ["studioRental", "rates"]) ?? [];
    const esRates: any[] = getIn(es, ["studioRental", "rates"]) ?? [];
    return enRates.map((r, i) => ({
      label: String(r?.label ?? ""),
      label_es: esRates[i]?.label && esRates[i]?.label !== r?.label ? String(esRates[i].label) : "",
      price: parseRatePrice(r?.price),
    }));
  }, onClose);

  if (!rows) return <Loading />;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () => {
    const clean = rows.filter((r) => r.label.trim());
    if (clean.some((r) => !(r.price > 0))) { toast.error("Every rate needs a price"); return; }
    run("Studio Rental rates", ({ en, es }) => ({
      en: setIn(en, ["studioRental", "rates"], clean.map((r) => ({ price: `$${r.price}`, label: r.label.trim() }))),
      es: setIn(es, ["studioRental", "rates"], clean.map((r) => ({ price: `$${r.price}`, label: r.label_es.trim() || r.label.trim() }))),
    }));
  };

  return (
    <Shell eyebrow="Studio Rental" title="Studio Rental rates" websitePath="/studio-rental" saving={saving} onSave={save} onClose={onClose}>
      <p className="font-body text-xs text-muted-foreground">Shown under "Rates" on the Studio Rental page, in USD. Leave the Spanish label empty to use the English one.</p>
      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[110px_1fr_1fr_110px] gap-2 px-1 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Price</span><span>Label (English)</span><span>Label (Español)</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr_110px] gap-2 items-center rounded-lg border border-border p-2 sm:border-0 sm:p-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input className="pl-6" type="number" min={0} value={r.price} onChange={(e) => update(i, { price: Number(e.target.value) })} />
            </div>
            <Input value={r.label} placeholder="e.g. 1 hour" onChange={(e) => update(i, { label: e.target.value })} />
            <Input value={r.label_es} placeholder={r.label || "ej. 1 hora"} onChange={(e) => update(i, { label_es: e.target.value })} />
            <div className="flex items-center">
              <IconBtn label="Move up" disabled={i === 0} onClick={() => setRows(moveItem(rows, i, i - 1))}><ArrowUp className="h-4 w-4" /></IconBtn>
              <IconBtn label="Move down" disabled={i === rows.length - 1} onClick={() => setRows(moveItem(rows, i, i + 1))}><ArrowDown className="h-4 w-4" /></IconBtn>
              <IconBtn label="Remove" danger onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconBtn>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { label: "", label_es: "", price: 0 }])}>
          <Plus className="h-4 w-4 mr-1" /> Add rate
        </Button>
      </div>
    </Shell>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cn("p-2 rounded-lg shrink-0 disabled:opacity-30 disabled:pointer-events-none", danger ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}

// Signature Experiences: homepage card ─────────────────────────

const HOME_PATH = ["signatureExperiences", "items"];

function SignatureHomeEditor({ index, services, onClose }: { index: number; services: { id: string; title: string; category: string }[]; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>("en");
  const { saving, run } = useSaver(onClose);
  const [form, setForm] = useLoaded(({ en, es }) => {
    const item = (getIn(en, HOME_PATH) ?? getIn(defaults, HOME_PATH) ?? [])[index] ?? {};
    const esItem = (getIn(es, HOME_PATH) ?? [])[index] ?? {};
    return {
      title: String(item.title ?? ""),
      benefit: String(item.benefit ?? ""),
      title_es: esItem.title && esItem.title !== item.title ? String(esItem.title) : "",
      benefit_es: esItem.benefit && esItem.benefit !== item.benefit ? String(esItem.benefit) : "",
      serviceId: String(item.serviceId ?? ""),
      category: String(item.category ?? ""),
      image: String(item.image ?? ""),
    };
  }, onClose);

  if (!form) return <Loading />;
  const es = lang === "es";
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = () => {
    if (!form.title.trim()) { toast.error("The English title is required"); setLang("en"); return; }
    run("Homepage card", ({ en, es: esC }) => {
      const enItems: any[] = [...(getIn(en, HOME_PATH) ?? getIn(defaults, HOME_PATH) ?? [])];
      enItems[index] = { ...enItems[index], title: form.title, benefit: form.benefit, serviceId: form.serviceId, category: form.category, image: form.image };
      const nextEn = setIn(en, HOME_PATH, enItems);
      const esItems: any[] | undefined = getIn(esC, HOME_PATH);
      // The Spanish site follows the English cards until something is translated.
      if (!esItems && !form.title_es.trim() && !form.benefit_es.trim()) return { en: nextEn, es: esC };
      const esRows = enItems.map((_, i) => (i === index ? { title: form.title_es, benefit: form.benefit_es } : esItems?.[i] ?? {}));
      return { en: nextEn, es: setIn(esC, HOME_PATH, completeEsList(enItems, esRows, ["title", "benefit"])) };
    });
  };

  const treatments = services.filter((s) => !["course", "workshop"].includes(s.category));

  return (
    <Shell eyebrow={`Signature Experiences · homepage card ${index + 1}`} title={form.title.replace(/\s*\n\s*/g, " ")} websitePath="/" lang={lang} setLang={setLang} saving={saving} onSave={save} onClose={onClose}>
      <Field label={es ? "Título (español)" : "Title *"} hint={es ? undefined : "Press Enter to break the title into two lines on the card."}>
        <TextArea rows={2} value={es ? form.title_es : form.title} placeholder={es ? form.title : ""} onChange={(v) => set(es ? { title_es: v } : { title: v })} />
      </Field>
      <Field label={es ? "Frase (español)" : "Short benefit"}>
        <TextArea rows={2} value={es ? form.benefit_es : form.benefit} placeholder={es ? form.benefit : ""} onChange={(v) => set(es ? { benefit_es: v } : { benefit: v })} />
      </Field>
      {!es && (
        <>
          <Field label="Book button opens" hint="The treatment guests book from this card.">
            <select
              className="flex h-10 w-full max-w-md rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
              value={form.serviceId}
              onChange={(e) => {
                const svc = services.find((s) => s.id === e.target.value);
                set({ serviceId: e.target.value, category: svc?.category ?? form.category });
              }}
            >
              <option value="">— Category page only —</option>
              {treatments.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.category}</option>)}
            </select>
          </Field>
          <Field label="Photo"><ImageField value={form.image} onChange={(v) => set({ image: v })} /></Field>
        </>
      )}
    </Shell>
  );
}

// Signature Experiences: Signature page card ───────────────────

const PAGE_PATH = ["signatureTreatments", "treatments"];

function SignaturePageEditor({ index, onClose }: { index: number; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>("en");
  const { saving, run } = useSaver(onClose);
  const [form, setForm] = useLoaded(({ en, es }) => {
    const item = (getIn(en, PAGE_PATH) ?? getIn(defaults, PAGE_PATH) ?? [])[index] ?? {};
    const esItem = (getIn(es, PAGE_PATH) ?? [])[index] ?? {};
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return {
      title: String(item.title ?? ""),
      description: String(item.description ?? ""),
      benefits: (Array.isArray(item.benefits) ? item.benefits : []) as string[],
      title_es: esItem.title && !same(esItem.title, item.title) ? String(esItem.title) : "",
      description_es: esItem.description && !same(esItem.description, item.description) ? String(esItem.description) : "",
      benefits_es: Array.isArray(esItem.benefits) && !same(esItem.benefits, item.benefits) ? (esItem.benefits as string[]) : [],
      image: String(item.image ?? ""),
      imageAlt: String(item.imageAlt ?? ""),
      bookingLink: String(item.bookingLink ?? ""),
      comingSoon: !!item.comingSoon,
    };
  }, onClose);

  if (!form) return <Loading />;
  const es = lang === "es";
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const list = es ? form.benefits_es : form.benefits;
  const setList = (v: string[]) => set(es ? { benefits_es: v } : { benefits: v });

  const save = () => {
    if (!form.title.trim()) { toast.error("The English title is required"); setLang("en"); return; }
    run(`"${form.title.trim()}"`, ({ en, es: esC }) => {
      const enItems: any[] = [...(getIn(en, PAGE_PATH) ?? getIn(defaults, PAGE_PATH) ?? [])];
      enItems[index] = {
        ...enItems[index],
        title: form.title.trim(),
        description: form.description.trim(),
        benefits: form.benefits.map((b) => b.trim()).filter(Boolean),
        image: form.image,
        imageAlt: form.imageAlt.trim() || form.title.trim(),
        bookingLink: form.bookingLink.trim(),
        comingSoon: form.comingSoon,
      };
      const nextEn = setIn(en, PAGE_PATH, enItems);
      const esItems: any[] | undefined = getIn(esC, PAGE_PATH);
      const translated = form.title_es.trim() || form.description_es.trim() || form.benefits_es.some((b) => b.trim());
      if (!esItems && !translated) return { en: nextEn, es: esC };
      const esRows = enItems.map((_, i) => (i === index ? { title: form.title_es, description: form.description_es, benefits: form.benefits_es } : esItems?.[i] ?? {}));
      return { en: nextEn, es: setIn(esC, PAGE_PATH, completeEsList(enItems, esRows, ["title", "description", "benefits"])) };
    });
  };

  return (
    <Shell eyebrow={`Signature Experiences · page card ${index + 1}`} title={form.title} websitePath="/signature-treatments" lang={lang} setLang={setLang} saving={saving} onSave={save} onClose={onClose}>
      <Field label={es ? "Título (español)" : "Title *"}>
        <Input value={es ? form.title_es : form.title} placeholder={es ? form.title : ""} onChange={(e) => set(es ? { title_es: e.target.value } : { title: e.target.value })} />
      </Field>
      <Field label={es ? "Descripción (español)" : "Description"}>
        <TextArea rows={4} value={es ? form.description_es : form.description} placeholder={es ? form.description : ""} onChange={(v) => set(es ? { description_es: v } : { description: v })} />
      </Field>
      <Field label={es ? "Beneficios (español)" : "Benefits"}>
        {es && form.benefits_es.length === 0 && form.benefits.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => set({ benefits_es: [...form.benefits] })}>Start from the English benefits to translate them</Button>
        ) : (
          <div className="space-y-2">
            {list.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input value={b} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} />
                <IconBtn label="Move up" disabled={i === 0} onClick={() => setList(moveItem(list, i, i - 1))}><ArrowUp className="h-4 w-4" /></IconBtn>
                <IconBtn label="Move down" disabled={i === list.length - 1} onClick={() => setList(moveItem(list, i, i + 1))}><ArrowDown className="h-4 w-4" /></IconBtn>
                <IconBtn label="Remove" danger onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconBtn>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setList([...list, ""])}><Plus className="h-4 w-4 mr-1" /> {es ? "Agregar beneficio" : "Add benefit"}</Button>
          </div>
        )}
      </Field>
      {!es && (
        <>
          <Field label="Book button link" hint='A page on the site, e.g. "/private-gyrotonic-manuel-antonio" or "/book?service=…".'>
            <Input value={form.bookingLink} onChange={(e) => set({ bookingLink: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-body">
            <input type="checkbox" checked={form.comingSoon} onChange={(e) => set({ comingSoon: e.target.checked })} />
            Show as "Coming soon" (no booking button)
          </label>
          <Field label="Photo"><ImageField value={form.image} onChange={(v) => set({ image: v })} /></Field>
        </>
      )}
    </Shell>
  );
}
