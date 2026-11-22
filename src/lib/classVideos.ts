import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A video for a class or event (e.g. Wellness Sunday). On the Classes page the
 * card keeps its photo and gets a "Watch video" button that opens the video
 * large, with sound.
 *
 * Kept in site_content ("class_videos" → { videos: { [classId]: url } }), next
 * to the other website settings, so no new column is needed. Set in Admin →
 * Classes → Edit Event → Event video. The file itself goes to the class-images
 * bucket (videos/…).
 */
export const CLASS_VIDEOS_KEY = "class_videos";

export async function fetchClassVideos(): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("site_content")
    .select("content")
    .eq("section_key", CLASS_VIDEOS_KEY)
    .maybeSingle();
  const raw = (data?.content as any)?.videos;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [id, url] of Object.entries(raw)) {
      if (typeof url === "string" && url.trim()) out[id] = url.trim();
    }
  }
  return out;
}

/** Sets (or, with an empty url, removes) one class's video. Returns an error message, if any. */
export async function setClassVideo(classId: string, url: string | null): Promise<string | null> {
  const videos = await fetchClassVideos();
  const next = (url || "").trim();
  if ((videos[classId] || "") === next) return null;
  if (next) videos[classId] = next;
  else delete videos[classId];
  const { error } = await supabase
    .from("site_content")
    .upsert(
      { section_key: CLASS_VIDEOS_KEY, content: { videos } as any, updated_at: new Date().toISOString() },
      { onConflict: "section_key" },
    );
  return error ? error.message : null;
}

/** All class videos, fetched once and shared by every card on the page. */
export function useClassVideos() {
  return useQuery({ queryKey: ["class-videos"], queryFn: fetchClassVideos, staleTime: 5 * 60 * 1000 });
}

/** The video of one class, if it has one. */
export function useClassVideo(classId: string | undefined): string | null {
  const { data } = useClassVideos();
  return (classId && data?.[classId]) || null;
}
