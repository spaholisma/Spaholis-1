import { Quote, Play } from "lucide-react";
import { useCourseReviews, youtubeId } from "@/hooks/useCourseReviews";

/** Written testimonials + YouTube video reviews for a course/module. Admin-editable. */
export function CourseReviews({ serviceId }: { serviceId: string }) {
  const { data: reviews = [] } = useCourseReviews(serviceId);
  const published = reviews.filter((r) => r.is_published && (r.review_text?.trim() || r.youtube_url?.trim()));
  if (published.length === 0) return null;

  const written = published.filter((r) => r.review_text?.trim());
  const videos = published.filter((r) => youtubeId(r.youtube_url));

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <p className="font-body text-xs font-semibold uppercase tracking-wider text-spa-sage mb-3">What people say</p>

      {written.length > 0 && (
        <div className="space-y-3">
          {written.map((r) => (
            <div key={r.id} className="rounded-xl bg-muted/40 p-4">
              <Quote className="h-4 w-4 text-spa-sage mb-2" />
              <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{r.review_text}</p>
              {r.author_name && <p className="font-body text-xs text-muted-foreground mt-2">— {r.author_name}</p>}
            </div>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {videos.map((r) => {
            const id = youtubeId(r.youtube_url)!;
            return (
              <a
                key={r.id}
                href={r.youtube_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block rounded-xl overflow-hidden border border-border"
              >
                <img
                  src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
                  alt={r.author_name ? `Video review — ${r.author_name}` : "Video review"}
                  loading="lazy"
                  className="w-full aspect-video object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/20 group-hover:bg-foreground/10 transition-colors">
                  <span className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="h-5 w-5 text-spa-sage translate-x-0.5" />
                  </span>
                </span>
                {r.author_name && (
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-foreground/70 to-transparent text-white text-xs font-body px-2 py-1.5">
                    {r.author_name}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
