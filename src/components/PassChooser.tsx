import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Ticket, ArrowLeft, Check, Infinity as InfinityIcon, ExternalLink, CalendarDays,
} from "lucide-react";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Offering {
  id: string; name: string; description: string | null; type: string;
  price: number; credits: number | null; duration_days: number | null; is_unlimited: boolean;
}
interface TeacherPass {
  membership_id: string; teacher_name: string; membership_name: string;
  price: number | null; classes_included: number | null; valid_days: number | null;
  description: string | null; payment_link: string | null; payment_note: string | null;
  teacher_payment_instructions: string | null;
}
interface Teacher { id: string; display_name: string }
interface ClassOption {
  class_id: string; title: string; teacher: string; when: string;
}

/**
 * The studio's price list, and the way to actually get one.
 *
 * Holis no longer takes the money for these: a pass is always with a teacher,
 * and she is paid directly. So instead of a checkout, picking a pass asks which
 * class you want it for — that names the teacher — and then shows how to pay
 * her. The request lands in her panel so she knows who to expect.
 */
export function PassChooser() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teacherPasses, setTeacherPasses] = useState<TeacherPass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const [picked, setPicked] = useState<Offering | null>(null);
  const [step, setStep] = useState<"class" | "pay" | "done">("class");
  const [chosenClass, setChosenClass] = useState<ClassOption | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const [{ data: off }, { data: sched }, { data: tp }, { data: th }] = await Promise.all([
        sb.from("offerings").select("id, name, description, type, price, credits, duration_days, is_unlimited")
          .eq("status", "active").order("sort_order"),
        sb.from("class_schedule")
          .select("class_id, start_time, instructor, classes(id, title, instructor, is_active)")
          .eq("is_cancelled", false).gte("start_time", now).order("start_time").limit(200),
        sb.rpc("public_teacher_portfolios"),
        sb.rpc("public_teachers"),
      ]);

      setOfferings(((off ?? []) as Offering[]));
      setTeacherPasses(((tp ?? []) as TeacherPass[]));
      setTeachers(((th ?? []) as Teacher[]));

      // One entry per class, with the days it runs and who teaches it.
      const map = new Map<string, { title: string; teacher: string; days: Set<number>; times: Set<string> }>();
      (((sched ?? []) as any[])).forEach((s) => {
        if (!s.classes?.is_active) return;
        const teacher = (s.instructor?.trim() || s.classes.instructor?.trim() || "");
        const key = `${s.class_id}|${teacher.toLowerCase()}`;
        if (!map.has(key)) map.set(key, { title: s.classes.title, teacher, days: new Set(), times: new Set() });
        const e = map.get(key)!;
        e.days.add(spaLocalParts(new Date(s.start_time)).weekday);
        e.times.add(formatSpaTime(s.start_time));
      });
      setClasses([...map.entries()].map(([key, e]) => ({
        class_id: key.split("|")[0],
        title: e.title,
        teacher: e.teacher,
        when: [[...e.days].sort((a, b) => a - b).map((d) => DAY_LABEL[d]).join(" · "),
               e.times.size === 1 ? [...e.times][0] : null].filter(Boolean).join("  |  "),
      })).sort((a, b) => a.title.localeCompare(b.title)));

      setLoading(false);
    })();
  }, []);

  const open = (o: Offering) => {
    setPicked(o);
    setChosenClass(null);
    setForm({ name: "", email: "", phone: "" });
    setStep("class");
  };

  /** Her version of the pass, if she keeps one by that name — else the studio price. */
  const herPass = useMemo(() => {
    if (!picked || !chosenClass?.teacher) return null;
    const t = chosenClass.teacher.trim().toLowerCase();
    return teacherPasses.find(
      (p) => p.teacher_name.trim().toLowerCase() === t
        && p.membership_name.trim().toLowerCase() === picked.name.trim().toLowerCase(),
    ) ?? null;
  }, [picked, chosenClass, teacherPasses]);

  const price = herPass?.price ?? picked?.price ?? null;

  const send = async () => {
    if (!picked || !chosenClass) return;
    if (!form.name.trim()) { toast.error("Please tell her your name"); return; }
    const teacherName = chosenClass.teacher.trim().toLowerCase();
    const teacherId = teachers.find(
      (t) => t.display_name.trim().toLowerCase() === teacherName)?.id;
    if (!teacherId) {
      toast.error("Could not reach that teacher — please write to us on WhatsApp");
      return;
    }
    setSaving(true);

    const { error } = await sb.from("teacher_pass_requests").insert({
      teacher_id: teacherId,
      membership_id: herPass?.membership_id ?? null,
      membership_name: picked.name,
      price,
      class_id: chosenClass.class_id,
      class_title: chosenClass.title,
      guest_name: form.name.trim(),
      guest_email: form.email.trim() || null,
      guest_phone: form.phone.trim() || null,
      status: "pending",
    });
    if (error) toast.error(error.message);
    else setStep("done");
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  const payInfo = herPass?.payment_note || herPass?.teacher_payment_instructions || null;
  const payLink = herPass?.payment_link || null;

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {offerings.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
          >
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-lg font-medium text-foreground">{o.name}</h3>
                {o.is_unlimited && (
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    <InfinityIcon className="h-3 w-3 inline mr-1" />Unlimited
                  </span>
                )}
              </div>
              {o.description && <p className="spa-body-sm mt-2">{o.description}</p>}
              <ul className="mt-3 space-y-1 font-body text-sm text-muted-foreground">
                <li><Check className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />
                  {o.is_unlimited ? "Unlimited classes" : `${o.credits ?? 1} class${(o.credits ?? 1) === 1 ? "" : "es"}`}
                </li>
                {o.duration_days && (
                  <li><Check className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />Valid for {o.duration_days} days</li>
                )}
              </ul>
              <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-heading text-2xl font-semibold text-foreground leading-none">{usd(o.price)}</p>
                  <p className="font-body text-[11px] text-muted-foreground mt-1">the usual price</p>
                </div>
                <Button size="sm" className="rounded-full" onClick={() => open(o)}>Get this pass</Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="spa-body-sm text-center mt-8 max-w-2xl mx-auto">
        These are the usual studio prices. Every pass is with a teacher and paid to her directly —
        pick one and we will show you who teaches what, and how to pay her.
      </p>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {step === "done" ? "She knows you are coming" : picked?.name}
            </DialogTitle>
          </DialogHeader>

          {/* 1. Which class do you want it for? That is what names the teacher. */}
          {step === "class" && (
            <div className="space-y-3">
              <p className="spa-body-sm">
                Which class do you want it for? That tells us who your teacher is — the pass is with her.
              </p>
              {classes.length === 0 ? (
                <p className="spa-body-sm">
                  Nothing on the schedule right now.{" "}
                  <Link to="/classes" className="text-primary hover:underline">See the classes</Link>.
                </p>
              ) : (
                <div className="space-y-2">
                  {classes.map((c) => (
                    <button
                      key={`${c.class_id}-${c.teacher}`}
                      onClick={() => { setChosenClass(c); setStep("pay"); }}
                      className={cn(
                        "w-full text-left rounded-xl border border-border p-3 transition-colors",
                        "hover:border-spa-sage/60 hover:bg-spa-sage/5",
                      )}
                    >
                      <p className="font-body text-sm font-medium text-foreground">{c.title}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3 inline mr-1" />{c.when}
                        {c.teacher ? <> · with <span className="font-medium text-foreground">{c.teacher}</span></> : " · teacher to be confirmed"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Her price and how she is paid, then leave her your name. */}
          {step === "pay" && chosenClass && (
            <div className="space-y-4">
              <button
                onClick={() => setStep("class")}
                className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5 inline mr-1" />Another class
              </button>

              <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-4">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {picked?.name} with
                </p>
                <p className="font-heading text-lg font-medium text-foreground">
                  {chosenClass.teacher || "the studio"}
                </p>
                <p className="font-body text-xs text-muted-foreground">{chosenClass.title} · {chosenClass.when}</p>
                {price != null && (
                  <p className="font-heading text-2xl font-semibold text-foreground mt-2">{usd(price)}</p>
                )}
                {herPass && herPass.price !== picked?.price && (
                  <p className="font-body text-[11px] text-muted-foreground">her price for this pass</p>
                )}
              </div>

              {chosenClass.teacher ? (
                <div className="rounded-xl border border-border p-4">
                  <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    How to pay {chosenClass.teacher.split(/\s+/)[0]}
                  </p>
                  {payInfo && (
                    <p className="font-body text-sm text-foreground whitespace-pre-line">{payInfo}</p>
                  )}
                  {payLink && (
                    <Button size="sm" variant="outline" className="rounded-full mt-2" asChild>
                      <a href={payLink} target="_blank" rel="noopener noreferrer">
                        Pay {chosenClass.teacher.split(/\s+/)[0]} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </a>
                    </Button>
                  )}
                  {!payInfo && !payLink && (
                    <p className="font-body text-sm text-muted-foreground">
                      She will tell you at the studio — cash or SINPE.
                    </p>
                  )}
                  <p className="font-body text-[11px] text-muted-foreground mt-2">
                    Holis does not take this payment. It goes to your teacher.
                  </p>
                </div>
              ) : (
                <p className="spa-body-sm">
                  That class has no teacher named yet — write to us on WhatsApp and we will sort it out.
                </p>
              )}

              <div className="space-y-2">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Let her know you are coming
                </p>
                <Input placeholder="Your name *" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Email (optional)" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <Input placeholder="Phone (optional)" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <Button className="w-full rounded-full" onClick={send}
                  disabled={saving || !form.name.trim() || !chosenClass.teacher}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ticket className="h-4 w-4 mr-1" />}
                  Tell {chosenClass.teacher ? chosenClass.teacher.split(/\s+/)[0] : "the studio"}
                </Button>
                <p className="font-body text-[11px] text-muted-foreground text-center">
                  Nothing is charged here. She gets your name and gives you the pass when you pay her.
                </p>
              </div>
            </div>
          )}

          {step === "done" && chosenClass && (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-spa-sage/20">
                <Check className="h-6 w-6 text-spa-sage" />
              </div>
              <p className="spa-body">
                <strong>{chosenClass.teacher}</strong> has your name and knows you want the{" "}
                {picked?.name} for {chosenClass.title}.
              </p>
              {(payInfo || payLink) && (
                <p className="spa-body-sm">
                  Pay her directly{payInfo ? <>: {payInfo}</> : null}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {payLink && (
                  <Button variant="outline" className="rounded-full" asChild>
                    <a href={payLink} target="_blank" rel="noopener noreferrer">
                      Pay now <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                )}
                <Button className="rounded-full" asChild>
                  <Link to={`/classes/${chosenClass.class_id}`}>See the class</Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
