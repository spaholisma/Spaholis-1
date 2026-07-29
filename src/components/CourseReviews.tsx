import { useState } from "react";
import { Quote, Play, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCourseReviews, youtubeId, type CourseReview } from "@/hooks/useCourseReviews";

/** Written testimonials + clickable YouTube video reviews for a course/module.
 *  Admin-editable, collapsible, laid out side-by-side, in the admin-set order. */
export function CourseReviews({ serviceId }: { serviceId: string }) {
  const { data: reviews = [] } = useCourseReviews(serviceId);
  const [open, setOpen] = useState(false);
  // One ordered list (sort_order from the query) — text and video mixed, so the
  // admin's ordering is respected exactly.
  const published = reviews.filter((r) => r.is_published && (r.review_text?.trim() || youtubeId(r.youtube_url)));
  if (published.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wider text-spa-sage hover:text-spa-sage/80 transition-colors"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        What people say ({published.length})
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {published.map((r) => <ReviewCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r }: { r: CourseReview }) {
  const [expanded, setExpanded] = useState(false);
  const yt = youtubeId(r.youtube_url);
  const text = r.review_text?.trim();
  const isLong = (text?.length ?? 0) > 260;

  return (
    <div className="rounded-xl bg-muted/40 p-4 flex flex-col gap-2 h-full">
      {text && (
        <div>
          <Quote className="h-4 w-4 text-spa-sage mb-2" />
          <p className={cn("font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-line", !expanded && isLong && "line-clamp-5")}>
            {text}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 font-body text-xs font-semibold text-spa-sage hover:underline"
            >
              {expanded ? "Read less" : "Read more"}
            </button>
          )}
          {r.author_name && <p className="font-body text-xs text-muted-foreground mt-2">— {r.author_name}</p>}
        </div>
      )}

      {yt && (
        <a
          href={r.youtube_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block rounded-lg overflow-hidden border border-border mt-auto"
          title="Watch on YouTube"
        >
          <img
            src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`}
            alt={r.author_name ? `Video review — ${r.author_name}` : "Video review"}
            loading="lazy"
            className="w-full aspect-video object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/20 group-hover:bg-foreground/10 transition-colors">
            <span className="h-11 w-11 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="h-5 w-5 text-spa-sage translate-x-0.5" />
            </span>
          </span>
          {!text && r.author_name && (
            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-foreground/70 to-transparent text-white text-xs font-body px-2 py-1.5">
              {r.author_name}
            </span>
          )}
        </a>
      )}
    </div>
  );
}
