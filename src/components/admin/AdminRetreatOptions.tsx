import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Languages } from "lucide-react";
import { content as defaults } from "@/data/content";
import { toast } from "sonner";

/* ── Editing model (EN + ES side by side) ── */
type Opt = { value: string; en: string; es: string };
type Cat = { titleEn: string; titleEs: string; subtitleEn: string; subtitleEs: string; options: Opt[] };

function slugValue(s: string) {
  return s.trim();
}

// Merge an EN option/label list with its ES counterpart (matched by canonical value).
function mergeOpts(en: any[], es: any[]): Opt[] {
  const esByVal = new Map<string, string>((es || []).map((o: any) => [o.value, o.label]));
  return (en || []).map((o: any) => ({ value: o.value, en: o.label ?? "", es: esByVal.get(o.value) ?? "" }));
}

async function fetchSection(key: string): Promise<Record<string, any>> {
  const { data } = await supabase.from("site_content").select("content").eq("section_key", key).maybeSingle();
  return (data?.content as Record<string, any>) || {};
}

export function AdminRetreatOptions() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enRow, setEnRow] = useState<Record<string, any>>({});
  const [esRow, setEsRow] = useState<Record<string, any>>({});
  const [intention, setIntention] = useState<Opt[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);

  useEffect(() => {
    (async () => {
      const [en, es] = await Promise.all([fetchSection("content"), fetchSection("content_es")]);
      setEnRow(en);
      setEsRow(es);
      // EN base = code defaults overlaid with any DB overrides.
      const dCr: any = (defaults as any).customRetreat;
      const enCr: any = en.customRetreat || {};
      const esCr: any = es.customRetreat || {};
      const enIntention = enCr.intentionOptions ?? dCr.intentionOptions;
      const enCats = enCr.serviceCategories ?? dCr.serviceCategories;

      setIntention(mergeOpts(enIntention, esCr.intentionOptions));

      const esCatByTitle = new Map<string, any>((esCr.serviceCategories || []).map((c: any) => [c.title, c]));
      // Match ES categories to EN by position (fallback) — ES title may differ,
      // so align by index which is how the site merge already works.
      const esCatsArr: any[] = esCr.serviceCategories || [];
      setCats(
        (enCats as any[]).map((c: any, i: number) => {
          const esC = esCatsArr[i] || esCatByTitle.get(c.title) || {};
          return {
            titleEn: c.title ?? "",
            titleEs: esC.title ?? "",
            subtitleEn: c.subtitle ?? "",
            subtitleEs: esC.subtitle ?? "",
            options: mergeOpts(c.options, esC.options),
          };
        }),
      );
      setLoading(false);
    })();
  }, []);

  /* ── Intention mutators ── */
  const addIntention = () => setIntention((l) => [...l, { value: "", en: "", es: "" }]);
  const setIntentionField = (i: number, field: keyof Opt, v: string) =>
    setIntention((l) => l.map((o, idx) => (idx === i ? { ...o, [field]: v } : o)));
  const removeIntention = (i: number) => setIntention((l) => l.filter((_, idx) => idx !== i));
  const moveIntention = (i: number, dir: -1 | 1) =>
    setIntention((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  /* ── Category mutators ── */
  const addCat = () => setCats((l) => [...l, { titleEn: "", titleEs: "", subtitleEn: "", subtitleEs: "", options: [] }]);
  const setCatField = (ci: number, field: keyof Cat, v: string) =>
    setCats((l) => l.map((c, idx) => (idx === ci ? { ...c, [field]: v } : c)));
  const removeCat = (ci: number) => setCats((l) => l.filter((_, idx) => idx !== ci));
  const moveCat = (ci: number, dir: -1 | 1) =>
    setCats((l) => {
      const j = ci + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[ci], next[j]] = [next[j], next[ci]];
      return next;
    });
  const addOpt = (ci: number) =>
    setCats((l) => l.map((c, idx) => (idx === ci ? { ...c, options: [...c.options, { value: "", en: "", es: "" }] } : c)));
  const setOptField = (ci: number, oi: number, field: keyof Opt, v: string) =>
    setCats((l) =>
      l.map((c, idx) =>
        idx === ci ? { ...c, options: c.options.map((o, j) => (j === oi ? { ...o, [field]: v } : o)) } : c,
      ),
    );
  const removeOpt = (ci: number, oi: number) =>
    setCats((l) => l.map((c, idx) => (idx === ci ? { ...c, options: c.options.filter((_, j) => j !== oi) } : c)));
  const moveOpt = (ci: number, oi: number, dir: -1 | 1) =>
    setCats((l) =>
      l.map((c, idx) => {
        if (idx !== ci) return c;
        const j = oi + dir;
        if (j < 0 || j >= c.options.length) return c;
        const opts = [...c.options];
        [opts[oi], opts[j]] = [opts[j], opts[oi]];
        return { ...c, options: opts };
      }),
    );

  /* ── Save ── */
  // For each option: keep the existing canonical `value`; new rows (blank value)
  // get their value from the English label so stored inquiries stay consistent.
  const finalize = (o: Opt) => ({ value: (o.value || slugValue(o.en)), enLabel: o.en.trim(), esLabel: o.es.trim() });

  const handleSave = async () => {
    // Drop fully-empty option/category rows.
    const cleanIntention = intention.map(finalize).filter((o) => o.enLabel && o.value);
    const cleanCats = cats
      .map((c) => ({
        titleEn: c.titleEn.trim(),
        titleEs: c.titleEs.trim(),
        subtitleEn: c.subtitleEn.trim(),
        subtitleEs: c.subtitleEs.trim(),
        opts: c.options.map(finalize).filter((o) => o.enLabel && o.value),
      }))
      .filter((c) => c.titleEn && c.opts.length > 0);

    const enCustom = {
      ...(enRow.customRetreat || {}),
      intentionOptions: cleanIntention.map((o) => ({ value: o.value, label: o.enLabel })),
      serviceCategories: cleanCats.map((c) => ({
        title: c.titleEn,
        subtitle: c.subtitleEn,
        options: c.opts.map((o) => ({ value: o.value, label: o.enLabel })),
      })),
    };
    const esCustom = {
      ...(esRow.customRetreat || {}),
      intentionOptions: cleanIntention.map((o) => ({ value: o.value, label: o.esLabel || o.enLabel })),
      serviceCategories: cleanCats.map((c) => ({
        title: c.titleEs || c.titleEn,
        subtitle: c.subtitleEs || c.subtitleEn,
        options: c.opts.map((o) => ({ value: o.value, label: o.esLabel || o.enLabel })),
      })),
    };

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("site_content")
        .upsert({ section_key: "content", content: { ...enRow, customRetreat: enCustom }, updated_at: now }, { onConflict: "section_key" });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("site_content")
        .upsert({ section_key: "content_es", content: { ...esRow, customRetreat: esCustom }, updated_at: now }, { onConflict: "section_key" });
      if (e2) throw e2;
      setEnRow((r) => ({ ...r, customRetreat: enCustom }));
      setEsRow((r) => ({ ...r, customRetreat: esCustom }));
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      toast.success("Retreat form options saved (EN + ES)");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground font-body">Loading…</p>;

  const enEs = (label: string, en: string, es: string, onEn: (v: string) => void, onEs: (v: string) => void, placeholder?: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN — {label}</span>
        <Input value={en} onChange={(e) => onEn(e.target.value)} placeholder={placeholder} className="text-sm" />
      </div>
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
          <Languages className="h-3 w-3" /> ES — {label}
        </span>
        <Input value={es} onChange={(e) => onEs(e.target.value)} placeholder={en || placeholder} className="text-sm" />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Retreat Form Options</h2>
          <p className="text-sm text-muted-foreground font-body">
            Add, edit, remove and reorder the Intention and Services &amp; Activities options on the Custom Retreat form. English + Spanish.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>

      {/* Intention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Retreat Intention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {intention.map((o, i) => (
            <div key={i} className="flex items-start gap-2 border border-border rounded-lg p-3">
              <div className="flex-1">
                {enEs("Label", o.en, o.es, (v) => setIntentionField(i, "en", v), (v) => setIntentionField(i, "es", v), "Option label")}
              </div>
              <div className="flex flex-col gap-1 pt-4">
                <button type="button" onClick={() => moveIntention(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => moveIntention(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === intention.length - 1}><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => removeIntention(i)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addIntention}><Plus className="h-4 w-4 mr-1" /> Add intention</Button>
        </CardContent>
      </Card>

      {/* Service categories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-medium text-foreground">Services &amp; Activities</h3>
          <Button variant="outline" size="sm" onClick={addCat}><Plus className="h-4 w-4 mr-1" /> Add category</Button>
        </div>

        {cats.map((c, ci) => (
          <Card key={ci}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">Category</Label>
                {enEs("Title", c.titleEn, c.titleEs, (v) => setCatField(ci, "titleEn", v), (v) => setCatField(ci, "titleEs", v), "Category title")}
                {enEs("Subtitle (optional)", c.subtitleEn, c.subtitleEs, (v) => setCatField(ci, "subtitleEn", v), (v) => setCatField(ci, "subtitleEs", v), "e.g. Self Discovery · Healing")}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => moveCat(ci, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={ci === 0}><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => moveCat(ci, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={ci === cats.length - 1}><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => removeCat(ci)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.options.map((o, oi) => (
                <div key={oi} className="flex items-start gap-2 border border-border rounded-lg p-2.5 bg-muted/30">
                  <div className="flex-1">
                    {enEs("Label", o.en, o.es, (v) => setOptField(ci, oi, "en", v), (v) => setOptField(ci, oi, "es", v), "Option label")}
                  </div>
                  <div className="flex flex-col gap-1 pt-4">
                    <button type="button" onClick={() => moveOpt(ci, oi, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={oi === 0}><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveOpt(ci, oi, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={oi === c.options.length - 1}><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeOpt(ci, oi)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addOpt(ci)}><Plus className="h-4 w-4 mr-1" /> Add option</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>
    </div>
  );
}
