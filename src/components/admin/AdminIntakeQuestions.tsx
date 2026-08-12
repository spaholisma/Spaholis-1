import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Languages } from "lucide-react";
import { content as defaults } from "@/data/content";
import { toast } from "sonner";

type QType = "text" | "textarea" | "checkbox";
type Row = { key: string; type: QType; labelEn: string; labelEs: string; placeholderEn: string; placeholderEs: string };

function slugKey(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "question";
}

async function fetchSection(key: string): Promise<Record<string, any>> {
  const { data } = await supabase.from("site_content").select("content").eq("section_key", key).maybeSingle();
  return (data?.content as Record<string, any>) || {};
}

export function AdminIntakeQuestions() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enRow, setEnRow] = useState<Record<string, any>>({});
  const [esRow, setEsRow] = useState<Record<string, any>>({});
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const [en, es] = await Promise.all([fetchSection("content"), fetchSection("content_es")]);
      setEnRow(en);
      setEsRow(es);
      const enArr: any[] = en.intakeExtraQuestions ?? (defaults as any).intakeExtraQuestions ?? [];
      const esArr: any[] = es.intakeExtraQuestions ?? [];
      const esByKey = new Map<string, any>((esArr || []).map((q: any) => [q.key, q]));
      setRows(
        (enArr as any[]).map((q) => ({
          key: q.key,
          type: (q.type as QType) || "text",
          labelEn: q.label ?? "",
          labelEs: esByKey.get(q.key)?.label ?? "",
          placeholderEn: q.placeholder ?? "",
          placeholderEs: esByKey.get(q.key)?.placeholder ?? "",
        })),
      );
      setLoading(false);
    })();
  }, []);

  const setField = (i: number, field: keyof Row, v: any) => setRows((l) => l.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const add = () => setRows((l) => [...l, { key: "", type: "text", labelEn: "", labelEs: "", placeholderEn: "", placeholderEs: "" }]);
  const remove = (i: number) => setRows((l) => l.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleSave = async () => {
    const used = new Set<string>();
    const clean = rows
      .filter((r) => r.labelEn.trim())
      .map((r) => {
        let key = r.key || slugKey(r.labelEn);
        while (used.has(key)) key = `${key}_2`;
        used.add(key);
        return { ...r, key };
      });

    const enArr = clean.map((r) => ({ key: r.key, type: r.type, label: r.labelEn.trim(), placeholder: r.type === "checkbox" ? "" : r.placeholderEn.trim() }));
    const esArr = clean.map((r) => ({ key: r.key, type: r.type, label: r.labelEs.trim() || r.labelEn.trim(), placeholder: r.type === "checkbox" ? "" : (r.placeholderEs.trim() || r.placeholderEn.trim()) }));

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const enContent = { ...enRow, intakeExtraQuestions: enArr };
      const esContent = { ...esRow, intakeExtraQuestions: esArr };
      const { error: e1 } = await supabase.from("site_content").upsert({ section_key: "content", content: enContent, updated_at: now }, { onConflict: "section_key" });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("site_content").upsert({ section_key: "content_es", content: esContent, updated_at: now }, { onConflict: "section_key" });
      if (e2) throw e2;
      setEnRow(enContent);
      setEsRow(esContent);
      // Sync the row's keys back so subsequent edits keep the same key.
      setRows(clean);
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      toast.success("Intake questions saved (EN + ES)");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground font-body">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Booking Intake — Extra Questions</h2>
          <p className="text-sm text-muted-foreground font-body max-w-2xl">
            Optional custom questions shown after the standard health questions in the booking flow. The core medical
            questions can’t be changed here. Answers appear on the appointment in the calendar.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <Card key={i}>
            <CardContent className="pt-4 flex items-start gap-3">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
                    <Select value={r.type} onValueChange={(v) => setField(i, "type", v as QType)}>
                      <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Short text</SelectItem>
                        <SelectItem value="textarea">Long text</SelectItem>
                        <SelectItem value="checkbox">Checkbox (Yes/No)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {r.key && <span className="text-[10px] text-muted-foreground font-mono pt-4">key: {r.key}</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN — Question</span>
                    <Input value={r.labelEn} onChange={(e) => setField(i, "labelEn", e.target.value)} className="text-sm" placeholder="e.g. Preferred pressure" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1"><Languages className="h-3 w-3" /> ES — Question</span>
                    <Input value={r.labelEs} onChange={(e) => setField(i, "labelEs", e.target.value)} className="text-sm" placeholder={r.labelEn} />
                  </div>
                </div>

                {r.type !== "checkbox" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN — Placeholder</span>
                      <Input value={r.placeholderEn} onChange={(e) => setField(i, "placeholderEn", e.target.value)} className="text-sm" placeholder="Hint text (optional)" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1"><Languages className="h-3 w-3" /> ES — Placeholder</span>
                      <Input value={r.placeholderEs} onChange={(e) => setField(i, "placeholderEs", e.target.value)} className="text-sm" placeholder={r.placeholderEn} />
                    </div>
                  </div>
                )}
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
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
        </Button>
      </div>
    </div>
  );
}
