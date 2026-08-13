import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { STATUS_LABELS, type PractitionerStatus } from "@/data/practitioners";
import { toast } from "sonner";

type Row = {
  id?: string;
  slug: string;
  name: string;
  role: string;
  status: PractitionerStatus[];
  bio: string;
  image: string;
  country: string;
  city: string;
  languages: string[];
  specialties: string[];
  certifications: string[];
  years_experience: number | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  bookable: boolean;
  is_active: boolean;
  sort_order: number;
};

const STATUS_ORDER: PractitionerStatus[] = ["certified", "senior", "instructor", "therapist", "graduate"];

const empty: Omit<Row, "id"> = {
  slug: "", name: "", role: "", status: ["certified", "therapist"], bio: "", image: "",
  country: "Costa Rica", city: "Manuel Antonio", languages: ["Spanish", "English"],
  specialties: [], certifications: [], years_experience: null, email: "", whatsapp: "", website: "",
  bookable: true, is_active: true, sort_order: 0,
};

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function AdminPractitioners() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | (Omit<Row, "id"> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("practitioners").select("*").order("sort_order").order("name");
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({ ...empty, sort_order: rows.length });

  const toggleStatus = (s: PractitionerStatus) =>
    setEditing((e) => {
      if (!e) return e;
      const has = e.status.includes(s);
      return { ...e, status: has ? e.status.filter((x) => x !== s) : [...e.status, s] } as any;
    });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name is required"); return; }
    const slug = editing.slug.trim() || slugify(editing.name);
    const payload = {
      slug, name: editing.name.trim(), role: editing.role, status: editing.status,
      bio: editing.bio, image: editing.image, country: editing.country, city: editing.city,
      languages: editing.languages, specialties: editing.specialties, certifications: editing.certifications,
      years_experience: editing.years_experience, email: editing.email || null,
      whatsapp: editing.whatsapp || null, website: editing.website || null,
      bookable: editing.bookable, is_active: editing.is_active, sort_order: editing.sort_order,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      if ("id" in editing && editing.id) {
        const { error } = await supabase.from("practitioners").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Practitioner updated");
      } else {
        const { error } = await supabase.from("practitioners").insert(payload);
        if (error) throw error;
        toast.success("Practitioner added");
      }
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.message?.includes("duplicate") ? "That URL slug is already used" : (err?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Row) => {
    if (!confirm(`Remove ${row.name} from the directory? This cannot be undone.`)) return;
    const { error } = await supabase.from("practitioners").delete().eq("id", row.id!);
    if (error) { toast.error(error.message); return; }
    toast.success("Practitioner removed");
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground font-body">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">SAS Practitioners Directory</h2>
          <p className="text-sm text-muted-foreground font-body">Add, edit, remove and reorder the certified practitioners shown at /sas-practitioners.</p>
        </div>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Add practitioner</Button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0">
              {row.image ? <img src={row.image} alt={row.name} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-body text-sm font-medium text-foreground">{row.name}</p>
                {!row.is_active && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
              </div>
              <p className="font-body text-xs text-muted-foreground truncate">{row.role} · {row.city}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(row)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground font-body py-8 text-center">No practitioners yet.</p>}
      </div>

      {editing && (
        <Card className="border-primary/40">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-foreground">{"id" in editing && editing.id ? "Edit practitioner" : "New practitioner"}</h3>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value } as any)} /></Field>
              <Field label="URL slug (auto if blank)"><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value } as any)} placeholder={slugify(editing.name)} className="font-mono text-sm" /></Field>
            </div>
            <Field label="Role / title"><Input value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value } as any)} /></Field>

            <ImageUploadField fieldId={`prac-img-${editing.slug || "new"}`} label="Photo" value={editing.image} onChange={(v) => setEditing({ ...editing, image: v } as any)} />

            <Field label="Bio"><Textarea value={editing.bio} onChange={(e) => setEditing({ ...editing, bio: e.target.value } as any)} className="min-h-[90px]" /></Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Country"><Input value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value } as any)} /></Field>
              <Field label="City"><Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value } as any)} /></Field>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Status / level</Label>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((s) => (
                  <button key={s} type="button" onClick={() => toggleStatus(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-body border transition-colors ${editing.status.includes(s) ? "bg-foreground text-background border-foreground" : "bg-muted text-muted-foreground border-border hover:border-foreground/40"}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Languages (comma-separated)"><Input value={editing.languages.join(", ")} onChange={(e) => setEditing({ ...editing, languages: toList(e.target.value) } as any)} /></Field>
            <Field label="Specialties (comma-separated)"><Input value={editing.specialties.join(", ")} onChange={(e) => setEditing({ ...editing, specialties: toList(e.target.value) } as any)} /></Field>
            <Field label="Certifications (comma-separated)"><Input value={editing.certifications.join(", ")} onChange={(e) => setEditing({ ...editing, certifications: toList(e.target.value) } as any)} /></Field>

            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Years experience"><Input type="number" value={editing.years_experience ?? ""} onChange={(e) => setEditing({ ...editing, years_experience: e.target.value ? parseInt(e.target.value) : null } as any)} /></Field>
              <Field label="Email"><Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value } as any)} /></Field>
              <Field label="Website"><Input value={editing.website ?? ""} onChange={(e) => setEditing({ ...editing, website: e.target.value } as any)} /></Field>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 items-center">
              <Field label="Sort order"><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 } as any)} /></Field>
              <label className="flex items-center gap-2 text-sm font-body mt-5">
                <input type="checkbox" checked={editing.bookable} onChange={(e) => setEditing({ ...editing, bookable: e.target.checked } as any)} /> Bookable (show Book button)
              </label>
              <label className="flex items-center gap-2 text-sm font-body mt-5">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked } as any)} /> Visible in directory
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
