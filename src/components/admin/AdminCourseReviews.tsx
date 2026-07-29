import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Trash2, Plus, Youtube, Pencil } from "lucide-react";
import { toast } from "sonner";
import { youtubeId } from "@/hooks/useCourseReviews";

interface Course { id: string; title: string; }
interface Review {
  id: string;
  service_id: string | null;
  author_name: string | null;
  review_text: string | null;
  youtube_url: string | null;
  sort_order: number;
  is_published: boolean;
}

const emptyDraft = () => ({ author_name: "", review_text: "", youtube_url: "", is_published: true, sort_order: 0 });

export function AdminCourseReviews() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("services").select("id, title").eq("type", "course").eq("is_active", true).order("sort_order")
      .then(({ data }) => {
        const list = (data as Course[]) ?? [];
        setCourses(list);
        if (list.length && !serviceId) setServiceId(list[0].id);
        setLoading(false);
      });
  }, []);

  const loadReviews = async (sid: string) => {
    const { data } = await (supabase.from("course_reviews" as any) as any)
      .select("*").eq("service_id", sid).order("sort_order").order("created_at");
    setReviews((data as Review[]) ?? []);
  };
  useEffect(() => { if (serviceId) loadReviews(serviceId); }, [serviceId]);

  const resetForm = () => { setDraft(emptyDraft()); setEditingId(null); };

  const save = async () => {
    if (!serviceId) return toast.error("Pick a course first");
    if (!draft.review_text?.trim() && !draft.youtube_url?.trim()) {
      return toast.error("Add a written review or a YouTube link");
    }
    if (draft.youtube_url?.trim() && !youtubeId(draft.youtube_url)) {
      return toast.error("That doesn't look like a valid YouTube link");
    }
    setSaving(true);
    const payload = {
      service_id: serviceId,
      author_name: draft.author_name?.trim() || null,
      review_text: draft.review_text?.trim() || null,
      youtube_url: draft.youtube_url?.trim() || null,
      is_published: draft.is_published,
      sort_order: Number(draft.sort_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const res = editingId
      ? await (supabase.from("course_reviews" as any) as any).update(payload).eq("id", editingId)
      : await (supabase.from("course_reviews" as any) as any).insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editingId ? "Review updated" : "Review added");
    resetForm();
    loadReviews(serviceId);
  };

  const edit = (r: Review) => {
    setEditingId(r.id);
    setDraft({ author_name: r.author_name ?? "", review_text: r.review_text ?? "", youtube_url: r.youtube_url ?? "", is_published: r.is_published, sort_order: r.sort_order });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    const { error } = await (supabase.from("course_reviews" as any) as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadReviews(serviceId);
  };

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Star className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Course Reviews</h3>
          <p className="font-body text-sm text-muted-foreground">Written testimonials and YouTube video reviews shown under a course on the Education page.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="font-body">Course</Label>
        <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); resetForm(); }}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {/* Existing reviews */}
      <div className="space-y-2">
        {reviews.length === 0 && <p className="font-body text-sm text-muted-foreground">No reviews yet for this course.</p>}
        {reviews.map((r) => {
          const yt = youtubeId(r.youtube_url);
          return (
            <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
              {yt && <img src={`https://img.youtube.com/vi/${yt}/default.jpg`} alt="" className="h-12 w-20 object-cover rounded shrink-0" />}
              <div className="min-w-0 flex-1">
                {r.review_text && <p className="font-body text-sm text-foreground line-clamp-2">{r.review_text}</p>}
                {r.youtube_url && <p className="font-body text-xs text-spa-sage flex items-center gap-1 truncate"><Youtube className="h-3 w-3 shrink-0" /> {r.youtube_url}</p>}
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  {r.author_name || "Anonymous"}{!r.is_published && " · hidden"}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / edit form */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <p className="font-body text-sm font-semibold text-foreground">{editingId ? "Edit review" : "Add a review"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="font-body text-xs">Author (optional)</Label>
            <Input value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} placeholder="e.g. Maria, Physiotherapist" />
          </div>
          <div>
            <Label className="font-body text-xs">Sort order</Label>
            <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
          </div>
        </div>
        <div>
          <Label className="font-body text-xs">Written review (optional)</Label>
          <Textarea value={draft.review_text} onChange={(e) => setDraft({ ...draft, review_text: e.target.value })} rows={3} placeholder="What they said…" />
        </div>
        <div>
          <Label className="font-body text-xs">YouTube link (optional)</Label>
          <Input value={draft.youtube_url} onChange={(e) => setDraft({ ...draft, youtube_url: e.target.value })} placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={draft.is_published} onCheckedChange={(v) => setDraft({ ...draft, is_published: v })} />
            <Label className="font-body text-sm">Published</Label>
          </div>
          <div className="flex gap-2">
            {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
            <Button onClick={save} disabled={saving}>
              {editingId ? "Save" : <><Plus className="h-4 w-4 mr-1" /> Add review</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
