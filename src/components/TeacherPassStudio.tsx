import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform,
  type Variants,
} from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import { CompraClickButton } from "@/components/payments/CompraClickButton";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarDays, Check, ChevronDown, ExternalLink, Infinity as InfinityIcon, Loader2, Sparkles,
  Ticket, Wallet,
} from "lucide-react";

const sb = supabase as any;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export interface StudioPass {
  id: string; name: string; description: string | null; type: string;
  price: number; credits: number | null; duration_days: number | null; is_unlimited: boolean;
}
export interface HerPass {
  membership_id: string; teacher_name: string; membership_name: string;
  price: number | null; classes_included: number | null; valid_days: number | null;
  description: string | null; payment_link: string | null; payment_note: string | null;
  teacher_payment_instructions: string | null;
  teacher_accepts_paypal?: boolean | null;
  teacher_compraclick_url?: string | null;
}
export interface PublicTeacher {
  id: string; display_name: string; photo_url: string | null; bio: string | null;
}
interface HerClass { title: string; when: string }

/** The teachers who sell this pass — only those, at their own price. */
export function teachersForPass(pass: StudioPass, herPasses: HerPass[], teachers: PublicTeacher[]) {
  return teachers
    .map((t) => ({
      teacher: t,
      herPass: herPasses.find(
        (p) => norm(p.teacher_name) === norm(t.display_name) && norm(p.membership_name) === norm(pass.name),
      ) ?? null,
    }))
    .filter((x): x is { teacher: PublicTeacher; herPass: HerPass } => !!x.herPass);
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Large screens show her card beside the passes; phones show it under the pass. */
function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function Avatar({ t, size, className }: { t: PublicTeacher; size: number; className?: string }) {
  return t.photo_url ? (
    <img src={t.photo_url} alt={t.display_name} width={size} height={size}
      className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className={cn("rounded-full flex items-center justify-center font-heading font-medium text-white bg-[#1d5b68]", className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(t.display_name)}
    </span>
  );
}

/** The price counts up when her card opens — small, but it makes the number land. */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => usd(Math.round(v)));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span>{text}</motion.span>;
}

/**
 * Passes and memberships, the way they are actually sold: each teacher sells
 * her own, at her own price. Pick the kind of pass, then the teacher — her
 * card opens with what the pass is, her classes, her price and how to pay her.
 * (The Drop-in class is rendered by the caller, exactly as before.)
 */
export function TeacherPassStudio({ dropIn }: { dropIn?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const wide = useWide();
  const [passes, setPasses] = useState<StudioPass[]>([]);
  const [herPasses, setHerPasses] = useState<HerPass[]>([]);
  const [teachers, setTeachers] = useState<PublicTeacher[]>([]);
  const [classesBy, setClassesBy] = useState<Map<string, HerClass[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [openPass, setOpenPass] = useState<string | null>(null);
  const [pick, setPick] = useState<{ passId: string; teacherId: string } | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const [{ data: off }, { data: tp }, { data: th }, { data: sched }] = await Promise.all([
        sb.from("offerings").select("id, name, description, type, price, credits, duration_days, is_unlimited")
          .eq("status", "active").neq("type", "drop_in").order("sort_order"),
        sb.rpc("public_teacher_portfolios"),
        sb.rpc("public_teachers"),
        sb.from("class_schedule")
          .select("start_time, instructor, classes(title, instructor, is_active)")
          .eq("is_cancelled", false).gte("start_time", now).order("start_time").limit(300),
      ]);
      setPasses((off ?? []) as StudioPass[]);
      setHerPasses((tp ?? []) as HerPass[]);
      setTeachers((th ?? []) as PublicTeacher[]);

      // Her classes: one line per class, with the days it runs and the time.
      const m = new Map<string, Map<string, { days: Set<number>; times: Set<string> }>>();
      ((sched ?? []) as any[]).forEach((s) => {
        if (!s.classes?.is_active) return;
        const who = norm(s.instructor) || norm(s.classes.instructor);
        if (!who) return;
        if (!m.has(who)) m.set(who, new Map());
        const byTitle = m.get(who)!;
        if (!byTitle.has(s.classes.title)) byTitle.set(s.classes.title, { days: new Set(), times: new Set() });
        const e = byTitle.get(s.classes.title)!;
        e.days.add(spaLocalParts(new Date(s.start_time)).weekday);
        e.times.add(formatSpaTime(s.start_time));
      });
      const out = new Map<string, HerClass[]>();
      m.forEach((byTitle, who) => out.set(who, [...byTitle.entries()].map(([title, e]) => ({
        title,
        when: [[...e.days].sort((a, b) => a - b).map((d) => DAY_LABEL[d]).join(" · "),
               e.times.size === 1 ? [...e.times][0] : null].filter(Boolean).join("  ·  "),
      }))));
      setClassesBy(out);
      setLoading(false);
    })();
  }, []);

  const selected = useMemo(() => {
    if (!pick) return null;
    const pass = passes.find((p) => p.id === pick.passId);
    const teacher = teachers.find((t) => t.id === pick.teacherId);
    if (!pass || !teacher) return null;
    const herPass = teachersForPass(pass, herPasses, [teacher])[0]?.herPass ?? null;
    if (!herPass) return null;
    return { pass, teacher, herPass, classes: classesBy.get(norm(teacher.display_name)) ?? [] };
  }, [pick, passes, teachers, herPasses, classesBy]);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  const card = selected && (
    <HerPassCard key={`${selected.pass.id}-${selected.teacher.id}`} {...selected} wide={wide} />
  );

  return (
    <LayoutGroup>
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 items-start">
        <div className="lg:col-span-5 space-y-4">
          {dropIn}
          {passes.map((pass, i) => {
            const sellers = teachersForPass(pass, herPasses, teachers);
            const isOpen = openPass === pass.id;
            const isPicked = pick?.passId === pass.id;
            return (
              <motion.div
                key={pass.id}
                layout={!reduce}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.07, 0.3), ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "relative rounded-2xl border bg-card p-5 transition-colors duration-300",
                  isOpen || isPicked ? "border-spa-sage shadow-[0_10px_40px_-18px_hsl(var(--spa-sage)/0.6)]" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium text-foreground">{pass.name}</h3>
                  {pass.is_unlimited && (
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                      <InfinityIcon className="h-3 w-3 inline mr-1" />Unlimited
                    </span>
                  )}
                </div>
                {pass.description && <p className="spa-body-sm mt-1.5">{pass.description}</p>}
                <ul className="mt-3 flex flex-wrap gap-2 font-body text-xs text-muted-foreground">
                  <li className="rounded-full bg-muted/70 px-2.5 py-1">
                    <Check className="h-3 w-3 inline mr-1 text-spa-sage" />
                    {pass.is_unlimited ? "Unlimited classes" : `${pass.credits ?? 1} classes`}
                  </li>
                  {pass.duration_days && (
                    <li className="rounded-full bg-muted/70 px-2.5 py-1">
                      <Check className="h-3 w-3 inline mr-1 text-spa-sage" />Valid {pass.duration_days} days
                    </li>
                  )}
                </ul>

                <button
                  type="button"
                  onClick={() => setOpenPass(isOpen ? null : pass.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 font-body text-sm font-medium transition-all",
                    "bg-foreground text-background hover:opacity-90 active:scale-[0.98]",
                  )}
                >
                  {isPicked && selected ? `With ${selected.teacher.display_name.split(/\s+/)[0]}` : "Choose your teacher"}
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      {sellers.length === 0 ? (
                        <p className="spa-body-sm pt-4">
                          No teacher offers this pass yet.{" "}
                          <Link to="/classes" className="text-primary hover:underline">See the classes</Link>.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-4 pt-5">
                          {sellers.map(({ teacher }, j) => {
                            const on = pick?.passId === pass.id && pick.teacherId === teacher.id;
                            return (
                              <motion.button
                                key={teacher.id}
                                type="button"
                                initial={{ opacity: 0, scale: 0.6, y: 8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ type: "spring", stiffness: 420, damping: 24, delay: 0.05 + j * 0.06 }}
                                whileHover={reduce ? undefined : { y: -3 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setPick({ passId: pass.id, teacherId: teacher.id })}
                                className="group flex w-20 flex-col items-center gap-1.5 focus-visible:outline-none"
                                aria-pressed={on}
                                aria-label={`${pass.name} with ${teacher.display_name}`}
                              >
                                <span className="relative">
                                  {on && (
                                    <motion.span
                                      layoutId="teacher-ring"
                                      className="absolute -inset-1.5 rounded-full border-2 border-spa-sage"
                                      transition={{ type: "spring", stiffness: 500, damping: 34 }}
                                    />
                                  )}
                                  <Avatar t={teacher} size={56}
                                    className="ring-2 ring-background transition-transform group-hover:scale-[1.04]" />
                                  {on && (
                                    <motion.span
                                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                                      className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-spa-sage text-white ring-2 ring-background"
                                    >
                                      <Check className="h-3 w-3" />
                                    </motion.span>
                                  )}
                                </span>
                                <span className={cn(
                                  "font-body text-xs text-center leading-tight",
                                  on ? "font-semibold text-foreground" : "text-muted-foreground",
                                )}>
                                  {teacher.display_name}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Phones: her card opens right here, under the pass. */}
                {!wide && (
                  <AnimatePresence mode="wait">
                    {isPicked && card}
                  </AnimatePresence>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Large screens: her card beside the passes, following you as you scroll. */}
        {wide && (
          <div className="lg:col-span-7 lg:sticky lg:top-28">
            <AnimatePresence mode="wait">
              {card || <EmptyStage key="empty" />}
            </AnimatePresence>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

function EmptyStage() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="relative flex min-h-[26rem] flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center"
    >
      <motion.img
        src="/class-placeholder.jpg" alt="" aria-hidden="true"
        className="mb-6 h-24 w-24 rounded-full object-cover opacity-90"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />
      <p className="font-heading text-xl text-foreground">Pick a pass, then your teacher</p>
      <p className="spa-body-sm mt-2 max-w-sm">
        Every pass is with a teacher and paid to her directly. Her card will open here —
        what the pass includes, her classes and her price.
      </p>
    </motion.div>
  );
}

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

function HerPassCard({
  pass, teacher, herPass, classes, wide,
}: { pass: StudioPass; teacher: PublicTeacher; herPass: HerPass; classes: HerClass[]; wide: boolean }) {
  const reduce = useReducedMotion();
  const first = teacher.display_name.split(/\s+/)[0];
  const [stage, setStage] = useState<"info" | "pay" | "sent" | "paid">("info");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Phones: her card opens under the pass — bring it into view.
  useEffect(() => {
    if (wide) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, [wide, reduce]);

  const price = herPass.price != null ? Number(herPass.price) : null;
  const description = herPass.description?.trim() || pass.description;
  const classCount = pass.is_unlimited ? null : (herPass.classes_included ?? pass.credits);
  const validDays = herPass.valid_days ?? pass.duration_days;
  const payInfo = herPass.payment_note || herPass.teacher_payment_instructions || null;
  const payLink = herPass.payment_link || null;
  const compraclick = herPass.teacher_compraclick_url || null;
  const canBuyOnline = !!herPass.teacher_accepts_paypal && price != null && price > 0;
  const contactReady = !!form.name.trim() && EMAIL_RE.test(form.email.trim());

  const send = async () => {
    if (!form.name.trim()) { toast.error("Tell her your name"); return; }
    setSaving(true);
    const { error } = await sb.from("teacher_pass_requests").insert({
      teacher_id: teacher.id,
      membership_id: herPass.membership_id,
      membership_name: pass.name,
      price,
      guest_name: form.name.trim(),
      guest_email: form.email.trim() || null,
      guest_phone: form.phone.trim() || null,
      status: "pending",
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else setStage("sent");
  };

  return (
    <motion.article
      ref={ref}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: wide ? 40 : 0, y: wide ? 0 : 16, scale: 0.97, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: wide ? -24 : 0, scale: 0.98, filter: "blur(4px)" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)]",
        !wide && "mt-5 scroll-mt-24",
      )}
      aria-label={`${pass.name} with ${teacher.display_name}`}
    >
      {/* The studio's spiral, slowly drifting, behind her photo. */}
      <div className="relative h-28 sm:h-32 overflow-hidden bg-[#1d5b68]">
        <motion.img
          src="/class-placeholder.jpg" alt="" aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          initial={{ scale: 1.25 }} animate={{ scale: 1.05 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <motion.span
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-[#1d5b68]"
        >
          <Sparkles className="h-3 w-3" /> {pass.name}
        </motion.span>
      </div>

      <motion.div
        className="px-6 pb-6 sm:px-8 sm:pb-8"
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } }}
      >
        <div className="relative z-10 -mt-11 flex items-start gap-4">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          >
            <Avatar t={teacher} size={wide ? 88 : 72} className="ring-4 ring-card shadow-lg" />
          </motion.div>
          <motion.div variants={item} className={cn("min-w-0", wide ? "pt-[3.25rem]" : "pt-[2.6rem]")}>
            <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pass.name} with
            </p>
            <h3 className="font-heading text-xl sm:text-2xl font-medium text-foreground leading-tight">{teacher.display_name}</h3>
          </motion.div>
        </div>

        {teacher.bio && <motion.p variants={item} className="spa-body-sm mt-4">{teacher.bio}</motion.p>}

        {description && (
          <motion.div variants={item} className="mt-5 rounded-2xl bg-muted/50 p-4">
            <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              About this pass
            </p>
            <p className="font-body text-sm text-foreground whitespace-pre-line">{description}</p>
          </motion.div>
        )}

        <motion.ul variants={item} className="mt-4 flex flex-wrap gap-2 font-body text-xs">
          <li className="rounded-full border border-border px-3 py-1.5 text-foreground">
            <Ticket className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />
            {pass.is_unlimited ? "Unlimited classes" : `${classCount ?? "—"} classes`}
          </li>
          {validDays && (
            <li className="rounded-full border border-border px-3 py-1.5 text-foreground">
              <CalendarDays className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />Valid {validDays} days
            </li>
          )}
          <li className="rounded-full border border-border px-3 py-1.5 text-foreground">
            <Wallet className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />Paid to {first} directly
          </li>
        </motion.ul>

        {classes.length > 0 && (
          <motion.div variants={item} className="mt-6">
            <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Her classes
            </p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {classes.map((c, k) => (
                <motion.li
                  key={c.title}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + k * 0.06 }}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="font-body text-sm font-medium text-foreground">{c.title}</span>
                  <span className="font-body text-xs text-muted-foreground text-right">{c.when}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div variants={item} className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <div>
            <p className="font-heading text-4xl font-semibold text-foreground leading-none">
              {price != null ? <CountUp value={price} /> : "Ask her"}
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1.5">{first}'s price for this pass</p>
          </div>
          {stage === "info" && (
            <Button size="lg" className="rounded-full px-7" onClick={() => setStage("pay")}>
              Get this pass
            </Button>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {stage === "pay" && (
            <motion.div
              key="pay"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input placeholder="Your name *" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} className="sm:col-span-2" />
                  <Input type="email" placeholder={canBuyOnline ? "Email *" : "Email"} value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <Input placeholder="Phone (optional)" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>

                {canBuyOnline && (
                  <div className="rounded-2xl border border-spa-sage/40 p-4 space-y-2">
                    <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pay {first} online
                    </p>
                    <PayPalCheckout
                      disabled={!contactReady}
                      createOrderBody={() => contactReady
                        ? {
                            kind: "teacher_pass", membership_id: herPass.membership_id,
                            guest_name: form.name.trim(), guest_email: form.email.trim(),
                            guest_phone: form.phone.trim() || null,
                          }
                        : null}
                      onSuccess={() => setStage("paid")}
                    />
                    <p className="font-body text-[11px] text-muted-foreground">
                      With PayPal or a card, straight to {first}'s PayPal. Your pass code and booking link arrive by email right away.
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-border p-4">
                  <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {canBuyOnline ? `Or pay ${first} another way` : `How to pay ${first}`}
                  </p>
                  {payInfo && <p className="font-body text-sm text-foreground whitespace-pre-line">{payInfo}</p>}
                  {payLink && (
                    <Button size="sm" variant="outline" className="rounded-full mt-2" asChild>
                      <a href={payLink} target="_blank" rel="noopener noreferrer">
                        Pay {first} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </a>
                    </Button>
                  )}
                  {compraclick && <CompraClickButton href={compraclick} className="mt-3" />}
                  {!payInfo && !payLink && !compraclick && (
                    <p className="font-body text-sm text-muted-foreground">In person at the studio — cash or SINPE.</p>
                  )}
                  <Button variant="outline" className="w-full rounded-full mt-4" onClick={send}
                    disabled={saving || !form.name.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Ticket className="h-4 w-4 mr-1.5" />}
                    Tell {first} I want this pass
                  </Button>
                  <p className="font-body text-[11px] text-muted-foreground mt-2 text-center">
                    Nothing is charged here. She gets your name and gives you the pass when you pay her.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {(stage === "sent" || stage === "paid") && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="mt-5 rounded-2xl bg-spa-sage/10 p-5 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-spa-sage text-white"
              >
                <Check className="h-6 w-6" />
              </motion.div>
              {stage === "paid" ? (
                <p className="spa-body">
                  Paid — your <strong>{pass.name}</strong> with <strong>{teacher.display_name}</strong> is ready.
                  We emailed your pass code to <strong>{form.email.trim()}</strong>.
                </p>
              ) : (
                <p className="spa-body">
                  <strong>{teacher.display_name}</strong> has your name and knows you want the {pass.name}.
                  {payInfo ? <> Pay her directly: {payInfo}</> : null}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.article>
  );
}
