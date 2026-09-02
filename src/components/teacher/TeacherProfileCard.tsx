import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Camera, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;
const BUCKET = "class-images";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Her face and her few words — what the website shows about her.
 *
 * The photo goes to the same public bucket the class pictures use, under a
 * teachers/ folder that the storage rules let a teacher write to. The file name
 * carries a timestamp so a replacement is never served from a stale cache.
 */
export function TeacherProfileCard({
  teacherId, displayName, photoUrl, bio, onSaved,
}: {
  teacherId: string;
  displayName: string;
  photoUrl: string | null;
  bio: string | null;
  onSaved: (patch: { photo_url?: string | null; bio?: string | null }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [bioDraft, setBioDraft] = useState(bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

  const pick = () => fileRef.current?.click();

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file"); return; }
    if (file.size > MAX_BYTES) { toast.error("That photo is over 5MB — try a smaller one"); return; }
    setUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `teachers/${teacherId}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl as string;
    const { error } = await sb.from("teachers").update({ photo_url: url }).eq("id", teacherId);
    if (error) toast.error(error.message);
    else { toast.success("Photo updated"); onSaved({ photo_url: url }); }
    setUploading(false);
  };

  const removePhoto = async () => {
    const { error } = await sb.from("teachers").update({ photo_url: null }).eq("id", teacherId);
    if (error) toast.error(error.message);
    else { toast.success("Photo removed"); onSaved({ photo_url: null }); }
  };

  const saveBio = async () => {
    setSavingBio(true);
    const value = bioDraft.trim() || null;
    const { error } = await sb.from("teachers").update({ bio: value }).eq("id", teacherId);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); onSaved({ bio: value }); }
    setSavingBio(false);
  };

  return (
    <Card className="p-4">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
        <UserRound className="h-4 w-4" /> How you appear on the website
      </h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Students see this on the Classes page and on your class pages.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="shrink-0">
          {photoUrl ? (
            <img src={photoUrl} alt={displayName}
              className="h-32 w-32 rounded-2xl object-cover object-top border border-border" />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40">
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={pick} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
              {photoUrl ? "Change" : "Add photo"}
            </Button>
            {photoUrl && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={removePhoto}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";       // so picking the same file twice still fires
              if (f) upload(f);
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <label className="font-body text-xs text-muted-foreground">A few words about you</label>
          <Textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            rows={5}
            maxLength={600}
            placeholder="Where you trained, how you teach, what a student can expect…"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-body text-[11px] text-muted-foreground">{bioDraft.length}/600</span>
            <Button size="sm" onClick={saveBio} disabled={savingBio || bioDraft === (bio ?? "")}>
              {savingBio ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
