import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, Sparkles, Ticket } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RichText } from "@/components/ui/rich-text";
import { useUpcomingEvents } from "@/hooks/useClasses";
import { PortfolioHeader, plural, teacherSlug, useTeacherPortfolios } from "@/components/TeacherPortfolios";
import { PassRequestDialog, type PassPick } from "@/components/PassRequestDialog";
import { PrivateClassDialog, type PrivatePick } from "@/components/PrivateClassDialog";
import { offeringPrice } from "@/lib/privateOfferings";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";

const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const crc = (n: number | null) => formatCRCWithUsd((n ?? 0) * USD_RATE);

const fadeIn = {
  initial: { opacity: 0, y: 18 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, ease: "easeOut" as const },
};

/**
 * A teacher's portfolio: who she is, the classes she gives (with Reserve),
 * her private classes at her own prices, and the passes she sells. The cards
 * on Classes and Private Sessions open this page; their buttons land on
 * #classes, #private or #passes.
 */
export default function TeacherProfile() {
  const { slug = "" } = useParams();
  const { data: sessions = [], isLoading: loadingSessions } = useUpcomingEvents();
  const { portfolios, isLoading } = useTeacherPortfolios(sessions, { teachersOnly: true });
  const p = portfolios.find((x) => x.slug === teacherSlug(slug));
  const [passPick, setPassPick] = useState<PassPick | null>(null);
  const [privatePick, setPrivatePick] = useState<PrivatePick | null>(null);

  const loading = isLoading || loadingSessions;
  const first = p?.teacher.split(/\s+/)[0] ?? "";

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO
        title={p ? `${p.teacher} — Teacher | Holis Wellness Center` : "Teacher | Holis Wellness Center"}
        description={p?.bio?.slice(0, 155) || "Classes, private classes and passes with a teacher at Holis Wellness Center, Manuel Antonio."}
        canonical={`/teachers/${teacherSlug(slug)}`}
        noindex={!loading && !p}
      />
      <Navbar />

      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {loading && !p ? (
            <div className="space-y-6">
              <Skeleton className="h-72 sm:h-96 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
          ) : !p ? (
            <div className="text-center py-24">
              <h1 className="spa-heading-md text-foreground mb-3">Teacher not found</h1>
              <p className="spa-body text-muted-foreground mb-6">This teacher is not on our schedule right now.</p>
              <Button asChild variant="spa"><Link to="/classes">See all classes</Link></Button>
            </div>
          ) : (
            <>
              <motion.div {...fadeIn} className="group overflow-hidden rounded-3xl border border-border bg-card">
                <PortfolioHeader p={p} tall />
                <div className="px-6 py-6 sm:px-8 sm:py-8">
                  {p.bio ? (
                    <p className="spa-body whitespace-pre-line">{p.bio}</p>
                  ) : (
                    <p className="spa-body text-muted-foreground">{p.teacher} teaches at Holis Wellness Center in Manuel Antonio.</p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {p.classes.length > 0 && (
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link to={{ hash: "#classes" }}>{plural(p.classes.length, "class", "classes")}</Link>
                      </Button>
                    )}
                    {p.privates.length > 0 && (
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link to={{ hash: "#private" }}>{plural(p.privates.length, "private class", "private classes")}</Link>
                      </Button>
                    )}
                    {p.passes.length > 0 && (
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link to={{ hash: "#passes" }}>{plural(p.passes.length, "pass", "passes")}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Her classes */}
              <section id="classes" className="mt-12 scroll-mt-24">
                <h2 className="spa-heading-md text-foreground mb-4 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-spa-sage" /> Classes with {first}
                </h2>
                {p.classes.length === 0 ? (
                  <p className="spa-body-sm text-muted-foreground">
                    No group classes on the schedule right now{p.privates.length ? ` — ${first} gives private classes, below.` : "."}
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {p.classes.map(({ cls, bookable, when }) => (
                      <div key={cls.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col">
                        <h3 className="font-heading text-lg font-medium text-foreground">{cls.title}</h3>
                        <p className="font-body text-xs text-muted-foreground mt-1">
                          {when}{cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
                        </p>
                        {cls.description && (
                          <p className="spa-body-sm mt-3 line-clamp-4 whitespace-pre-line">
                            <RichText value={cls.description} />
                          </p>
                        )}
                        <div className="mt-auto pt-4">
                          {bookable ? (
                            <Button size="sm" variant="spa" className="rounded-full" asChild>
                              <Link to={`/classes/${cls.id}`}>Reserve</Link>
                            </Button>
                          ) : (
                            <Link to={`/classes/${cls.id}`} className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                              Full — see other dates
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Her private classes, at her prices */}
              {p.privates.length > 0 && (
                <section id="private" className="mt-12 scroll-mt-24">
                  <h2 className="spa-heading-md text-foreground mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-spa-sage" /> Private classes with {first}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {p.privates.map((o) => {
                      const prices = [
                        { label: "1 person", value: offeringPrice(o, "oneOnOne", 1) },
                        { label: "2 people", value: offeringPrice(o, "couples", 2) },
                        { label: "Group, up to 4", value: offeringPrice(o, "group", 4) },
                      ].filter((x) => x.value != null);
                      return (
                        <div key={o.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col">
                          <h3 className="font-heading text-lg font-medium text-foreground">
                            {o.title}
                            {o.duration_minutes ? <span className="font-body text-xs font-normal text-muted-foreground"> · {o.duration_minutes} min</span> : null}
                          </h3>
                          {o.description && <p className="spa-body-sm mt-2 whitespace-pre-line">{o.description}</p>}
                          <ul className="mt-3 space-y-1">
                            {prices.map((x) => (
                              <li key={x.label} className="flex items-center justify-between font-body text-sm">
                                <span className="text-muted-foreground">{x.label}</span>
                                <span className="font-heading font-semibold text-foreground">{crc(x.value)}</span>
                              </li>
                            ))}
                            {o.price_group != null && o.price_extra != null && (
                              <li className="flex items-center justify-between font-body text-sm">
                                <span className="text-muted-foreground">Each extra person</span>
                                <span className="font-heading font-semibold text-foreground">+{crc(o.price_extra)}</span>
                              </li>
                            )}
                          </ul>
                          <div className="mt-auto pt-4">
                            <Button size="sm" variant="spa" className="rounded-full"
                              onClick={() => setPrivatePick({ teacherName: p.teacher, offerings: p.privates, initialOfferingId: o.id })}>
                              Request a private class
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* The passes she sells */}
              {p.passes.length > 0 && (
                <section id="passes" className="mt-12 scroll-mt-24">
                  <h2 className="spa-heading-md text-foreground mb-4 flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-spa-sage" /> Passes with {first}
                  </h2>
                  <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                    {p.passes.map((pass) => (
                      <div key={pass.membership_id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0">
                          <p className="font-heading text-base text-foreground">{pass.membership_name}</p>
                          <p className="font-body text-xs text-muted-foreground">
                            {pass.classes_included == null ? "unlimited" : plural(pass.classes_included, "class", "classes")}
                            {pass.valid_days != null && ` · ${pass.valid_days} days`}
                          </p>
                          {pass.description && <p className="spa-body-sm mt-1">{pass.description}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {pass.price != null && <span className="font-heading text-lg font-semibold text-foreground">{usd(pass.price)}</span>}
                          {p.teacherId && (
                            <Button size="sm" variant="outline" className="rounded-full"
                              onClick={() => setPassPick({
                                teacherId: p.teacherId!,
                                teacherName: p.teacher,
                                membershipId: pass.membership_id,
                                membershipName: pass.membership_name,
                                price: pass.price,
                                paymentNote: pass.payment_note ?? pass.teacher_payment_instructions,
                                paymentLink: pass.payment_link,
                                acceptsPaypal: !!pass.teacher_accepts_paypal,
                                compraclickUrl: pass.teacher_compraclick_url ?? null,
                              })}>
                              Get it
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-2">Paid directly to {first}.</p>
                </section>
              )}
            </>
          )}

          {/* Back — at the bottom, like every other page */}
          <div className="mt-14 flex justify-center">
            <Button asChild variant="ghost">
              <Link to="/classes"><ChevronLeft className="h-4 w-4 mr-1" /> All classes & teachers</Link>
            </Button>
          </div>
        </div>
      </main>

      <PassRequestDialog pick={passPick} onOpenChange={(o) => !o && setPassPick(null)} />
      <PrivateClassDialog pick={privatePick} onOpenChange={(o) => !o && setPrivatePick(null)} />
      <Footer />
    </div>
  );
}
