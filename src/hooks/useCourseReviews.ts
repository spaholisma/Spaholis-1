import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CourseReview {
  id: string;
  service_id: string | null;
  author_name: string | null;
  review_text: string | null;
  youtube_url: string | null;
  photo_url: string | null;
  sort_order: number;
  is_published: boolean;
}

/** Extract a YouTube video id from any common URL shape (watch, youtu.be, embed, shorts). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export function useCourseReviews(serviceId?: string | null) {
  return useQuery({
    queryKey: ["course-reviews", serviceId ?? "all"],
    queryFn: async (): Promise<CourseReview[]> => {
      let q = (supabase.from("course_reviews" as any) as any)
        .select("*")
        .order("sort_order")
        .order("created_at");
      if (serviceId) q = q.eq("service_id", serviceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as CourseReview[]) ?? [];
    },
    enabled: serviceId !== null,
  });
}
