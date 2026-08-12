import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Languages } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { content as defaults } from "@/data/content";
import { toast } from "sonner";

export type ListField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "image";
  translatable?: boolean;
};

/**
 * Generic add / edit / remove / reorder manager for a CMS list stored at
 * content.<section>.<arrayKey> (English) and content_es.<section>.<arrayKey>
 * (Spanish, matched by index). Handles arrays of objects, or — when
 * `stringItems` is set — arrays of plain strings (single translatable field).
 */
export function AdminCmsListManager({
  title,
  description,
  section,
  arrayKey,
  fields,
  stringItems = false,
  itemNoun = "item",
}: {
  title: string;
  description?: string;
  section: string;
  arrayKey: string;
  fields: ListField[];
  stringItems?: boolean;
  itemNoun?: string;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enRow, setEnRow] = useState<Record<string, any>>({});
  const [esRow, setEsRow] = useState<Record<string, any>>({});
  // Each row: { en: <object|string>, es: <partial object|string> }
  const [rows, setRows] = useState<{ en: any; es: any }[]>([]);

  const emptyItem = () =>
    stringItems ? "" : fields.reduce((acc, f) => ({ ...acc, [f.key]: f.type === "number" ? 0 : "" }), {} as any);

  useEffect(() => {
    (async () => {
      const [{ data: en }, { data: es }] = await Promise.all([
        supabase.from("site_content").select("content").eq("section_key", "content").maybeSingle(),
        supabase.from("site_content").select("content").eq("section_key", "content_es").maybeSingle(),
      ]);
      const enC = (en?.content as any) || {};
      const esC = (es?.content as any) || {};
      setEnRow(enC);
      setEsRow(esC);
      const enArr: any[] = enC[section]?.[arrayKey] ?? (defaults as any)[section]?.[arrayKey] ?? [];
      const esArr: any[] = esC[section]?.[arrayKey] ?? [];
      setRows(enArr.map((item, i) => ({ en: item, es: esArr[i] ?? (stringItems ? "" : {}) })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, arrayKey]);

  const setEn = (i: number, key: string, v: any) =>
    setRows((l) => l.map((r, idx) => (idx === i ? { ...r, en: stringItems ? v : { ...r.en, [key]: v } } : r)));
  const setEs = (i: number, key: string, v: any) =>
    setRows((l) => l.map((r, idx) => (idx === i ? { ...r, es: stringItems ? v : { ...(r.es || {}), [key]: v } } : r)));
  const add = () => setRows((l) => [...l, { en: emptyItem(), es: stringItems ? "" : {} }]);
  const remove = (i: number) => setRows((l) => l.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const isBlankRow = (r: { en: any; es: any }) => {
    if (stringItems) return !String(r.en ?? "").trim();
    return !fields.some((f) => f.type !== "number" && String(r.en?.[f.key] ?? "").trim());
  };

  const handleSave = async () => {
    const clean = rows.filter((r) => !isBlankRow(r));
    const enArr = clean.map((r) => (stringItems ? String(r.en).trim() : r.en));
    // ES array must be complete (site merge replaces the whole array): copy the
    // EN value for any non-translatable field or empty translation.
    const esArr = clean.map((r) => {
      if (stringItems) return String(r.es ?? "").trim() || String(r.en).trim();
      const out: any = {};
      for (const f of fields) {
        const enV = r.en?.[f.key];
        if (f.translatable) {
          const esV = r.es?.[f.key];
          out[f.key] = esV != null && String(esV).trim() !== "" ? esV : enV;
        } else {
          out[f.key] = enV;
        }
      }
      return out;
    });

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const enContent = { ...enRow, [section]: { ...(enRow[section] || {}), [arrayKey]: enArr } };
      const esContent = { ...esRow, [section]: { ...(esRow[section] || {}), [arrayKey]: esArr } };
      const { error: e1 } = await supabase
        .from("site_content")
        .upsert({ section_key: "content", content: enContent, updated_at: now }, { onConflict: "section_key" });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("site_content")
        .upsert({ section_key: "content_es", content: esContent, updated_at: now }, { onConflict: "section_key" });
      if (e2) throw e2;
      setEnRow(enContent);
      setEsRow(esContent);
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      toast.success(`${title} saved (EN + ES)`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground font-body">Loading…</p>;

  const renderField = (i: number, f: ListField) => {
    const enV = stringItems ? rows[i].en : rows[i].en?.[f.key] ?? "";
    const esV = stringItems ? rows[i].es : rows[i].es?.[f.key] ?? "";

    if (f.type === "image") {
      return (
        <ImageUploadField
          key={f.key}
          fieldId={`${section}-${arrayKey}-${i}-${f.key}`}
          label={f.label}
          value={enV}
          onChange={(v) => setEn(i, f.key, v)}
        />
      );
    }
    if (f.type === "number") {
      return (
        <div key={f.key} className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</span>
          <Input
            type="number"
            value={enV}
            onChange={(e) => setEn(i, f.key, parseFloat(e.target.value) || 0)}
            className="text-sm max-w-[120px]"
          />
        </div>
      );
    }
    const FieldEl: any = f.type === "textarea" ? Textarea : Input;
    if (!f.translatable) {
      return (
        <div key={f.key} className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</span>
          <FieldEl value={enV} onChange={(e: any) => setEn(i, f.key, e.target.value)} className="text-sm" />
        </div>
      );
    }
    return (
      <div key={f.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN — {f.label}</span>
          <FieldEl value={enV} onChange={(e: any) => setEn(i, f.key, e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
            <Languages className="h-3 w-3" /> ES — {f.label}
          </span>
          <FieldEl value={esV} placeholder={enV} onChange={(e: any) => setEs(i, f.key, e.target.value)} className="text-sm" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-heading font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground font-body">{description}</p>}
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 flex items-start gap-3">
              <div className="flex-1 space-y-3">
                {fields.map((f) => renderField(i, f))}
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === rows.length - 1}><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(i)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-4 w-4" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add {itemNoun}</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>
    </div>
  );
}
