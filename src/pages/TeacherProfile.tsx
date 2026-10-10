import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, ChevronLeft, Clock, MapPin, Quote, Sparkles, Ticket } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RichText } from "@/components/ui/rich-text";
import { useUpcomingEvents } from "@/hooks/useClasses";
import { fallbackImg, initials, plural, teacherSlug, useTeacherPortfolios, type Portfolio } from "@/components/TeacherPortfolios";
import { PassRequestDialog, type PassPick } from "@/components/PassRequestDialog";
import { PrivateClassDialog, type PrivatePick } from "@/components/PrivateClassDialog";
import { fromPrice, offeringPrice } from "@/lib/privateOfferings";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { cn } from "@/lib/utils";

const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const crc = (n: number | null) => formatCRCWithUsd((n ?? 0) * USD_RATE);

const reveal = {
  initial: { opacity: 0, y: 22 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

/**
 * Her bio, read the way teachers write it: a short first paragraph is the
 * greeting under her name ("Meet Evelina Bolognini"), a line with " · " in it
 * lists what she teaches, and the paragraphs after it are her story.
 */
export function splitBio(bio: string | null | undefined) {
  const paras = (bio ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return { intro: null as string | null, specialties: [] as string[], story: [] as string[] };
  const lines = paras[0].split("\n").map((l) => l.trim()).filter(Boolean);
  const specLine = lines.find((l) => l.split("·").length > 1) ?? null;
  const specialties = specLine ? specLine.split("·").map((s) => s.trim()).filter(Boolean) : [];
  const introText = lines.filter((l) => l !== specLine).join(" ");
  // Only a short opening is a greeting; a long one is part of her story.
  const shortIntro = paras.length > 1 && introText.length <= 160;
  return {
    intro: shortIntro ? introText || null : null,
    specialties,
    story: shortIntro || (!introText && specLine) ? paras.slice(1) : [introText, ...paras.slice(1)].filter(Boolean),
  };
}

/**
 * A teacher's portfolio: her portrait and who she is, the classes she gives
 * (with Reserve), her private classes at her own prices, and the passes she
 * sells. The cards on Classes and Private Sessions open this page; their
 * buttons land on #classes, #private or #passes.
 */
export default function TeacherProfile() {
  const { slug = "" } = useParams();
  const { data: sessions = [], isLoading: loadingSessions } = useUpcomingEvents();
  const { portfolios, isLoading } = useTeacherPortfolios(sessions, { teachersOnly: true });
  const p = portfolios.find((x) => x.slug === teacherSlug(slug));
  const [passPick, setPassPick] = useState<PassPick | null>(null);
  const [privatePick, setPrivatePick] = useState<PrivatePick | null>(null);
  const loading = isLoading || loadingSessions;
  const bio = splitBio(p?.bio);

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO
        title={p ? `${p.teacher} — Teacher | Holis Wellness Center` : "Teacher | Holis Wellness Center"}
        description={(bio.story[0] || p?.bio || "").slice(0, 155) || "Classes, private classes and passes with a teacher at Holis Wellness Center, Manuel Antonio."}
        canonical={`/teachers/${teacherSlug(slug)}`}
        image={p?.portrait ? p.image ?? undefined : undefined}
        noindex={!loading && !p}
      />
      <Navbar />

      {loading && !p ? (
        <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[5fr_6fr] items-center">
            <Skeleton className="aspect-[3/4] w-full max-w-md mx-auto rounded-[2rem]" />
            <div className="space-y-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-24 w-full" /></div>
          </div>
        </main>
      ) : !p ? (
        <main className="pt-28 pb-20 px-4 text-center">
          <h1 className="spa-heading-md text-foreground mb-3 mt-16">Teacher not found</h1>
          <p className="spa-body text-muted-foreground mb-6">This teacher is not on our schedule right now.</p>
          <Button asChild variant="spa"><Link to="/classes">See all classes</Link></Button>
        </main>
      ) : (
        <Profile p={p} bio={bio} onPass={setPassPick} onPrivate={setPrivatePick} />
      )}

      {/* Back — at the bottom, like every other page */}
      <div className="pb-16 flex justify-center">
        <Button asChild variant="ghost">
          <Link to="/classes"><ChevronLeft className="h-4 w-4 mr-1" /> All classes & teachers</Link>
        </Button>
      </div>

      <PassRequestDialog pick={passPick} onOpenChange={(o) => !o && setPassPick(null)} />
      <PrivateClassDialog pick={privatePick} onOpenChange={(o) => !o && setPrivatePick(null)} />
      <Footer />
    </div>
  );
}

function Profile({ p, bio, onPass, onPrivate }: {
  p: Portfolio;
  bio: ReturnType<typeof splitBio>;
  onPass: (pick: PassPick) => void;
  onPrivate: (pick: PrivatePick) => void;
}) {
  const first = p.teacher.split(/\s+/)[0];
  const from = Math.min(...p.privates.map((o) => fromPrice(o) ?? Infinity));
  const sections = [
    { id: "about", label: "About" },
    { id: "classes", label: "Classes" },
    ...(p.privates.length ? [{ id: "private", label: "Private classes" }] : []),
    ...(p.passes.length ? [{ id: "passes", label: "Passes" }] : []),
  ];
  const stats = [
    { id: "classes", n: p.classes.length, label: p.classes.length === 1 ? "class" : "classes", show: true },
    { id: "private", n: p.privates.length, label: p.privates.length === 1 ? "private class" : "private classes", show: p.privates.length > 0 },
    { id: "passes", n: p.passes.length, label: p.passes.length === 1 ? "pass" : "passes", show: p.passes.length > 0 },
  ].filter((s) => s.show);
  const askPrivate = (offeringId?: string) =>
    onPrivate({ teacherName: p.teacher, offerings: p.privates, initialOfferingId: offeringId ?? p.privates[0]?.id });

  return (
    <main>
      {/* ── Hero: her portrait, her name, what she teaches ── */}
      <section className="relative isolate overflow-hidden pt-24 pb-16 sm:pt-28 lg:pb-24">
        {/* Soft light behind her — gradients only, no blur filters (cheap on phones). */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-spa-sage/20 via-spa-sage/5 to-background" aria-hidden />
        <div className="absolute -right-32 top-16 -z-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,hsl(var(--spa-sage)/0.22),transparent)]" aria-hidden />
        <div className="absolute -left-40 bottom-0 -z-10 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(closest-side,hsl(var(--spa-sage)/0.14),transparent)]" aria-hidden />

        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[5fr_6fr] lg:gap-16 lg:px-8">
          {/* Portrait */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto w-full max-w-[18.5rem] sm:max-w-md"
          >
            <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-[2.25rem] bg-spa-sage/30" aria-hidden />
            <div className="absolute -inset-3 -rotate-2 rounded-[2.5rem] border border-spa-sage/40" aria-hidden />
            <div className="relative aspect-[3/4] overflow-hidden rounded-[2rem] bg-spa-sage/20 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.portrait ? `${p.teacher}, teacher at Holis Wellness Center` : ""}
                  className={cn("h-full w-full object-cover", p.portrait && "object-[50%_20%]")}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    if (!el.src.endsWith(fallbackImg)) el.src = fallbackImg;
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-spa-sage/40 to-spa-cream">
                  <span className="font-heading text-7xl text-spa-charcoal/80">{initials(p.teacher)}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" aria-hidden />
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-card/95 px-5 py-2.5 shadow-lg backdrop-blur">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-spa-sage">Teacher · Holis Wellness</span>
            </div>
          </motion.div>

          {/* Who she is */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center lg:text-left"
          >
            <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-spa-sage">Meet your teacher</p>
            <h1 className="spa-heading-xl mt-3 text-foreground">{p.teacher}</h1>
            {bio.intro && <p className="mt-3 font-heading text-xl text-muted-foreground sm:text-2xl">{bio.intro}</p>}
            {bio.specialties.length > 0 && (
              <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
                {bio.specialties.map((s) => (
                  <li key={s} className="rounded-full border border-spa-sage/40 bg-spa-sage/10 px-4 py-1.5 font-body text-xs font-medium text-foreground">
                    {s}
                  </li>
                ))}
              </ul>
            )}

            {stats.length > 0 && (
              <div className="mt-8 grid grid-cols-3 gap-3 max-w-md mx-auto lg:mx-0">
                {stats.map((s) => (
                  <Link key={s.id} to={{ hash: `#${s.id}` }}
                    className="group rounded-2xl border border-border bg-card/80 px-3 py-4 text-center backdrop-blur transition-all hover:-translate-y-0.5 hover:border-spa-sage hover:shadow-md">
                    <span className="block font-heading text-3xl text-foreground">{s.n}</span>
                    <span className="block font-body text-[11px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground">{s.label}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              {p.privates.length > 0 && (
                <Button variant="spa" size="lg" className="w-full rounded-full sm:w-auto" onClick={() => askPrivate()}>
                  <Sparkles className="h-4 w-4 mr-2" /> Request a private class
                  {Number.isFinite(from) && <span className="ml-1.5 hidden opacity-80 sm:inline">· from {usd(from)}</span>}
                </Button>
              )}
              {p.classes.length > 0 && (
                <Button asChild variant="outline" size="lg" className="rounded-full">
                  <Link to={{ hash: "#classes" }}><CalendarDays className="h-4 w-4 mr-2" /> See {first}'s classes</Link>
                </Button>
              )}
            </div>
            {p.privates.length > 0 && Number.isFinite(from) && (
              <p className="mt-3 font-body text-xs text-muted-foreground sm:hidden">Private classes from {usd(from)}</p>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Sections menu, stays at the top while scrolling ── */}
      <nav aria-label={`${first}'s portfolio`} className="sticky top-16 z-30 border-y border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          {sections.map((s) => (
            <Link key={s.id} to={{ hash: `#${s.id}` }}
              className="shrink-0 rounded-full px-4 py-2 font-body text-sm text-muted-foreground transition-colors hover:bg-spa-sage/10 hover:text-foreground">
              {s.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Her story ── */}
        <motion.section {...reveal} id="about" className="scroll-mt-32 py-16 sm:py-20 grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <Quote className="h-10 w-10 text-spa-sage/50" aria-hidden />
            <h2 className="spa-heading-lg mt-3 text-foreground">About {first}</h2>
          </div>
          <div className="space-y-5">
            {(bio.story.length ? bio.story : [`${p.teacher} teaches at Holis Wellness Center in Manuel Antonio.`]).map((para, i) => (
              <p key={i} className={cn("whitespace-pre-line", i === 0 ? "font-heading text-xl leading-relaxed text-foreground sm:text-2xl" : "spa-body")}>
                {para}
              </p>
            ))}
          </div>
        </motion.section>

        {/* ── Her classes ── */}
        <motion.section {...reveal} id="classes" className="scroll-mt-32 border-t border-border py-16 sm:py-20">
          <SectionTitle icon={<CalendarDays className="h-5 w-5" />} eyebrow="On the schedule" title={`Classes with ${first}`} />
          {p.classes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="spa-body text-muted-foreground">
                No group classes on the schedule right now.
                {p.privates.length > 0 && <> {first} gives private classes — <button type="button" onClick={() => askPrivate()} className="font-medium text-primary underline underline-offset-4">ask for one</button>.</>}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {p.classes.map(({ cls, bookable, when }) => (
                <article key={cls.id} className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-xl">
                  <div className="relative h-44 overflow-hidden bg-spa-sage/15">
                    <img src={cls.image_url || fallbackImg} alt="" aria-hidden loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => { const el = e.currentTarget; if (!el.src.endsWith(fallbackImg)) el.src = fallbackImg; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-5 font-heading text-xl text-spa-cream">{cls.title}</h3>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {when && <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {when}</p>}
                    {cls.location && <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {cls.location}</p>}
                    {cls.description && (
                      <p className="spa-body-sm mt-3 line-clamp-3 whitespace-pre-line"><RichText value={cls.description} /></p>
                    )}
                    <div className="mt-auto pt-5">
                      {bookable ? (
                        <Button size="sm" variant="spa" className="rounded-full" asChild>
                          <Link to={`/classes/${cls.id}`}>Reserve <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                        </Button>
                      ) : (
                        <Link to={`/classes/${cls.id}`} className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                          Full — see other dates
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </motion.section>

        {/* ── Her private classes, at her prices ── */}
        {p.privates.length > 0 && (
          <motion.section {...reveal} id="private" className="scroll-mt-32 border-t border-border py-16 sm:py-20">
            <SectionTitle icon={<Sparkles className="h-5 w-5" />} eyebrow="Just for you" title={`Private classes with ${first}`}
              note="One-on-one, for two or a small group, at her own prices — tell her where and when you would like it." />
            <div className="grid gap-6 md:grid-cols-2">
              {p.privates.map((o) => {
                const prices = [
                  { label: "1 person", value: offeringPrice(o, "oneOnOne", 1) },
                  { label: "2 people", value: offeringPrice(o, "couples", 2) },
                  { label: "Group, up to 4", value: offeringPrice(o, "group", 4) },
                ].filter((x) => x.value != null);
                const low = fromPrice(o);
                return (
                  <article key={o.id} className="relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-7 transition-shadow hover:shadow-xl">
                    <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-[4rem] bg-spa-sage/10" aria-hidden />
                    <div className="relative flex items-start justify-between gap-4">
                      <h3 className="font-heading text-2xl text-foreground">{o.title}</h3>
                      {low != null && (
                        <span className="shrink-0 rounded-full bg-spa-charcoal px-3 py-1 font-body text-xs font-semibold text-spa-cream">from {usd(low)}</span>
                      )}
                    </div>
                    {o.duration_minutes ? (
                      <p className="relative mt-1 flex items-center gap-1.5 font-body text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {o.duration_minutes} min</p>
                    ) : null}
                    {o.description && <p className="relative spa-body-sm mt-4 whitespace-pre-line">{o.description}</p>}
                    <dl className="relative mt-5 divide-y divide-border rounded-2xl border border-border bg-background/60">
                      {prices.map((x) => (
                        <div key={x.label} className="flex items-center justify-between px-4 py-2.5">
                          <dt className="font-body text-sm text-muted-foreground">{x.label}</dt>
                          <dd className="font-heading text-base font-semibold text-foreground">{crc(x.value)}</dd>
                        </div>
                      ))}
                      {o.price_group != null && o.price_extra != null && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <dt className="font-body text-sm text-muted-foreground">Each extra person</dt>
                          <dd className="font-heading text-base font-semibold text-foreground">+{crc(o.price_extra)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="relative mt-auto pt-6">
                      <Button variant="spa" className="w-full rounded-full sm:w-auto" onClick={() => askPrivate(o.id)}>
                        Request a private class
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ── The passes she sells ── */}
        {p.passes.length > 0 && (
          <motion.section {...reveal} id="passes" className="scroll-mt-32 border-t border-border py-16 sm:py-20">
            <SectionTitle icon={<Ticket className="h-5 w-5" />} eyebrow="Practice more, save more" title={`Passes with ${first}`}
              note="Buy online with PayPal or a card — paid to Holis Wellness Center — or ask her about other ways to pay." />
            <div className="grid gap-5 sm:grid-cols-2">
              {p.passes.map((pass) => (
                <article key={pass.membership_id} className="relative flex overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg">
                  {/* A ticket: the price on the stub, a perforated line, the pass */}
                  <div className="flex w-28 shrink-0 flex-col items-center justify-center bg-spa-sage/15 px-3 py-6 text-center sm:w-32">
                    {pass.price != null && <span className="font-heading text-3xl text-foreground">{usd(pass.price)}</span>}
                    <span className="mt-1 font-body text-[11px] uppercase tracking-wider text-muted-foreground">
                      {pass.classes_included == null ? "unlimited" : plural(pass.classes_included, "class", "classes")}
                    </span>
                  </div>
                  <div className="relative border-l-2 border-dashed border-border" aria-hidden>
                    <span className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full border border-border bg-background" />
                    <span className="absolute -left-[9px] -bottom-2 h-4 w-4 rounded-full border border-border bg-background" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-5">
                    <h3 className="font-heading text-lg text-foreground">{pass.membership_name}</h3>
                    {pass.valid_days != null && <p className="font-body text-xs text-muted-foreground">Valid {pass.valid_days} days</p>}
                    {pass.description && <p className="spa-body-sm mt-2 line-clamp-2">{pass.description}</p>}
                    {p.teacherId && (
                      <div className="mt-auto pt-4">
                        <Button size="sm" variant="outline" className="rounded-full"
                          onClick={() => onPass({
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
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Closing invitation ── */}
        {(p.privates.length > 0 || p.classes.length > 0) && (
          <motion.section {...reveal} className="mb-12 overflow-hidden rounded-[2rem] bg-spa-charcoal px-6 py-12 text-center sm:px-12">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-spa-cream/70">Holis Wellness Center · Manuel Antonio</p>
            <h2 className="spa-heading-lg mt-3 text-spa-cream">Practice with {first}</h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {p.privates.length > 0 && (
                <Button size="lg" className="rounded-full bg-spa-cream text-spa-charcoal hover:bg-spa-cream/90" onClick={() => askPrivate()}>
                  Request a private class
                </Button>
              )}
              {p.classes.length > 0 && (
                <Button asChild size="lg" variant="outline" className="rounded-full border-spa-cream/40 bg-transparent text-spa-cream hover:bg-spa-cream/10 hover:text-spa-cream">
                  <Link to={{ hash: "#classes" }}>See the classes</Link>
                </Button>
              )}
            </div>
          </motion.section>
        )}
      </div>
    </main>
  );
}

function SectionTitle({ icon, eyebrow, title, note }: { icon: ReactNode; eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-8">
      <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-[0.22em] text-spa-sage">
        {icon} {eyebrow}
      </p>
      <h2 className="spa-heading-lg mt-2 text-foreground">{title}</h2>
      {note && <p className="spa-body mt-2 text-muted-foreground">{note}</p>}
    </div>
  );
}
