import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RichText } from "@/components/ui/rich-text";
import { OfferingsPurchaseSection } from "@/components/OfferingsPurchaseSection";
import { Loader2, ArrowLeft, MapPin, Clock, CalendarDays, Ticket } from "lucide-react";
import { formatSpaDate, formatSpaTime, spaLocalParts } from "@/lib/businessHours";
import { localizeRow } from "@/lib/localizeRow";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLASS_I18N = ["title", "description", "location", "instructor", "payment_instructions"];
const fallbackImg = "/class-placeholder.jpg";
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Cls {
  id: string; title: string; description: string | null; image_url: string | null;
  location: string | null; duration_minutes: number | null; price: number | null;
  price_label: string | null; instructor: string | null;
}
interface Session {
  id: string; start_time: string; spots_remaining: number; instructor: string | null;
}
interface Teacher { display_name: string; photo_url: string | null; bio: string | null }
interface Pass {
  teacher_name: string; membership_name: string; price: number | null;
  classes_included: number | null; valid_days: number | null; description: string | null;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/**
 * One class, and the person who teaches it.
 *
 * Reserving used to jump straight from a card into the booking form. This sits
 * in between: what the class is, when it runs, who runs it and what she sells —
 * with the reserve button pinned to the bottom of the screen so it is never more
 * than a tap away, however far down the page you have read.
 */
export default function ClassDetail() {
  const { classId = "" } = useParams();
  const { language } = useLanguage();
  const [cls, setCls] = useState<Cls | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: s }] = await Promise.all([
        sb.from("classes").select("*").eq("id", classId).maybeSingle(),
        sb.from("class_schedule")
          .select("id, start_time, spots_remaining, instructor")
          .eq("class_id", classId).eq("is_cancelled", false)
          .gte("start_time", new Date().toISOString())
          .order("start_time").limit(12),
      ]);
      if (!alive) return;
      setCls(c ? (localizeRow(c, language, CLASS_I18N) as Cls) : null);
      setSessions(((s ?? []) as Session[]));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [classId, language]);

  // Who teaches it: the name on the sessions wins over the class template's.
  const teacherName = useMemo(() => {
    const fromSession = sessions.find((x) => x.instructor?.trim())?.instructor?.trim();
    return (fromSession || cls?.instructor?.trim() || "");
  }, [sessions, cls]);

  useEffect(() => {
    if (!teacherName) { setTeacher(null); setPasses([]); return; }
    const key = teacherName.trim().toLowerCase();
    sb.rpc("public_teachers").then(({ data }: any) =>
      setTeacher(((data ?? []) as Teacher[])
        .find((t) => t.display_name.trim().toLowerCase() === key) ?? null));
    sb.rpc("public_teacher_portfolios").then(({ data }: any) =>
      setPasses(((data ?? []) as Pass[])
        .filter((p) => p.teacher_name.trim().toLowerCase() === key)));
  }, [teacherName]);

  const bookable = sessions.find((s) => s.spots_remaining > 0);
  const when = useMemo(() => {
    if (!sessions.length) return "";
    const days = [...new Set(sessions.map((s) => spaLocalParts(new Date(s.start_time)).weekday))]
      .sort((a, b) => a - b).map((d) => DAY_LABEL[d]);
    const times = [...new Set(sessions.map((s) => formatSpaTime(s.start_time)))];
    return [days.join(" · "), times.length === 1 ? times[0] : null].filter(Boolean).join("  |  ");
  }, [sessions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
        <Footer />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-md mx-auto text-center py-32 px-4">
          <h1 className="font-heading text-2xl text-foreground mb-2">Class not found</h1>
          <p className="font-body text-muted-foreground mb-6">
            It may have been taken off the schedule.
          </p>
          <Button asChild><Link to="/classes">See all classes</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${cls.title} | Holis Wellness Center`}
        description={(cls.description ?? "").replace(/<[^>]*>/g, "").slice(0, 155)}
      />
      <Navbar />

      {/* Hero */}
      <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden">
        <img
          src={cls.image_url || fallbackImg}
          alt={cls.title}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            if (!el.src.endsWith(fallbackImg)) el.src = fallbackImg;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
            <Link
              to="/classes"
              className="inline-flex items-center gap-1 font-body text-xs font-semibold uppercase tracking-wider text-spa-cream/80 hover:text-spa-cream mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All classes
            </Link>
            <h1 className="font-heading text-3xl sm:text-4xl font-medium text-spa-cream">{cls.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-body text-sm text-spa-cream/85">
              {when && <span><CalendarDays className="h-4 w-4 inline mr-1.5" />{when}</span>}
              {cls.duration_minutes && <span><Clock className="h-4 w-4 inline mr-1.5" />{cls.duration_minutes} min</span>}
              {cls.location && <span><MapPin className="h-4 w-4 inline mr-1.5" />{cls.location}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* pb leaves room for the pinned bar so it never covers the last words */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-36">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {cls.description && (
              <div className="spa-body whitespace-pre-line">
                <RichText value={cls.description} />
              </div>
            )}

            {/* Next dates */}
            <h2 className="font-heading text-lg font-semibold text-foreground mt-10 mb-3">Next dates</h2>
            {sessions.length === 0 ? (
              <p className="spa-body-sm">
                Nothing scheduled right now.{" "}
                <Link to="/classes/schedule" className="text-primary hover:underline">See the full schedule</Link>.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div>
                      <p className="font-body text-sm font-medium text-foreground">{formatSpaDate(s.start_time)}</p>
                      <p className="font-body text-xs text-muted-foreground">{formatSpaTime(s.start_time)}</p>
                    </div>
                    {s.spots_remaining > 0 ? (
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link to={`/class-booking?class=${s.id}`}>Reserve</Link>
                      </Button>
                    ) : (
                      <span className="font-body text-xs font-semibold text-destructive">Full</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* The teacher, and what she sells */}
          <aside className="space-y-4">
            {teacherName && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-4 p-5">
                    {teacher?.photo_url ? (
                      <img
                        src={teacher.photo_url}
                        alt={teacherName}
                        className="h-20 w-20 rounded-2xl object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-spa-sage/20 font-heading text-xl font-semibold text-foreground">
                        {initials(teacherName)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Your teacher
                      </p>
                      <p className="font-heading text-xl font-medium text-foreground truncate">{teacherName}</p>
                    </div>
                  </div>
                  {teacher?.bio && (
                    <p className="spa-body-sm px-5 pb-5 whitespace-pre-line">{teacher.bio}</p>
                  )}

                  {passes.length > 0 && (
                    <div className="border-t border-border bg-muted/30 px-5 py-4">
                      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Ticket className="h-3.5 w-3.5" />
                        Only with {teacherName.split(/\s+/)[0]}
                      </p>
                      <ul className="space-y-1.5">
                        {passes.map((p) => (
                          <li key={p.membership_name} className="flex items-baseline justify-between gap-3">
                            <span className="font-body text-sm text-foreground">
                              {p.membership_name}
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                {p.classes_included == null
                                  ? "unlimited"
                                  : `${p.classes_included} class${p.classes_included === 1 ? "" : "es"}`}
                                {p.valid_days != null && ` · ${p.valid_days} days`}
                              </span>
                            </span>
                            {p.price != null && (
                              <span className="font-heading text-sm font-semibold text-foreground whitespace-nowrap">
                                {usd(p.price)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="font-body text-[11px] text-muted-foreground mt-3">
                        Paid directly to {teacherName.split(/\s+/)[0]} — ask her at the studio.
                      </p>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {/* The studio's passes work in every class and are the same whoever
                teaches, so they are named once here and bought on their own page. */}
            <Card className="p-5">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" /> Passes & memberships
              </p>
              <p className="spa-body-sm mb-3">
                Coming more than once? A class pass or a monthly works out cheaper than
                paying per class, and it can be used in any class.
              </p>
              <Button variant="outline" size="sm" className="rounded-full" asChild>
                <Link to="/memberships">See passes & memberships</Link>
              </Button>
            </Card>
          </aside>
        </div>
      </div>

      {/* Pinned reserve bar — stays with you as you scroll */}
      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center px-4">
          <div className={cn(
            "pointer-events-auto flex items-center gap-4 rounded-full border border-border",
            "bg-card/95 px-5 py-2.5 shadow-lg backdrop-blur",
          )}>
            <div className="hidden sm:block">
              <p className="font-body text-xs text-muted-foreground leading-tight">
                {bookable ? formatSpaDate(bookable.start_time) : "Next class"}
              </p>
              <p className="font-heading text-sm font-semibold text-foreground leading-tight">
                {(cls.price_label || (cls.price ? usd(cls.price) : "")) || cls.title}
              </p>
            </div>
            {bookable ? (
              <Button className="rounded-full px-7" asChild>
                <Link to={`/class-booking?class=${bookable.id}`}>Reserve</Link>
              </Button>
            ) : (
              <Button className="rounded-full px-7" variant="outline" asChild>
                <Link to="/classes/schedule">See other dates</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
