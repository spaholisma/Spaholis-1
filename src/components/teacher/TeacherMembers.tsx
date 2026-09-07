import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Plus, Snowflake, Play, CalendarPlus, Ban, RotateCcw, Copy, Check, Users,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Pass { id: string; name: string; price: number | null; classes_included: number | null; valid_days: number | null; is_active: boolean }
interface Member {
  id: string; name_snapshot: string; type: string; guest_name: string | null; guest_email: string | null;
  is_unlimited: boolean; credits_total: number | null; credits_remaining: number | null;
  starts_at: string | null; expires_at: string | null; status: string; frozen_at: string | null;
  code: string | null; access_token: string | null; created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  frozen: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  expired: "bg-muted text-muted-foreground",
  depleted: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

/**
 * The people who bought a pass from her, and the pass itself.
 *
 * Creating an order is the teacher saying "she paid me": it mints the same code
 * and booking link the studio's own orders use, so the student can book classes
 * with it straight away. Holis never touches the money — she did.
 */
export function TeacherMembers({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", passId: "" });
  const [result, setResult] = useState<{ code: string; link: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [extending, setExtending] = useState<Member | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      sb.from("teacher_memberships").select("id, name, price, classes_included, valid_days, is_active")
        .eq("teacher_id", teacherId).eq("is_active", true).order("price"),
      sb.from("user_offerings")
        .select("id, name_snapshot, type, guest_name, guest_email, is_unlimited, credits_total, credits_remaining, starts_at, expires_at, status, frozen_at, code, access_token, created_at")
        .eq("teacher_id", teacherId).order("created_at", { ascending: false }),
    ]);
    setPasses(((p ?? []) as Pass[]));
    setMembers(((m ?? []) as Member[]));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { load(); }, [load]);

  const createOrder = async () => {
    if (!form.firstName.trim() || !form.email.trim()) { toast.error("First name and email are required"); return; }
    if (!form.passId) { toast.error("Pick one of your passes"); return; }
    setSaving(true);
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    const { data, error } = await sb.rpc("create_teacher_membership_order", {
      _membership_id: form.passId,
      _guest_name: fullName,
      _guest_email: form.email.trim(),
      _guest_phone: form.phone.trim() || null,
      _notes: `Sold by ${teacherName}`,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }

    const res = data as any;
    setResult({
      code: res.code,
      link: `${window.location.origin}/classes?m=${res.access_token}`,
      name: res.offering_name,
    });
    toast.success(`Order created — code ${res.code}`);

    // The "your pass is ready" email, with the code and the booking link.
    sb.functions.invoke("send-membership-order-email", { body: { userOfferingId: res.id } })
      .then(({ error: mailErr }: any) => mailErr
        ? toast.warning("Created, but the email did not send — share the link yourself.")
        : toast.success("Email sent to your student."))
      .catch(() => toast.warning("Created, but the email did not send — share the link yourself."));

    setForm({ firstName: "", lastName: "", email: "", phone: "", passId: "" });
    setSaving(false);
    load();
  };

  const patch = async (m: Member, values: Record<string, unknown>, msg: string) => {
    const { error } = await sb.from("user_offerings").update(values).eq("id", m.id);
    if (error) toast.error(error.message);
    else { toast.success(msg); load(); }
  };

  const freeze = (m: Member) =>
    patch(m, { status: "frozen", frozen_at: new Date().toISOString() }, "Paused");

  /** Unfreezing gives back the days it stood still, so a pause costs nothing. */
  const unfreeze = (m: Member) => {
    const paused = m.frozen_at ? Math.max(0, differenceInCalendarDays(new Date(), parseISO(m.frozen_at))) : 0;
    const expires = m.expires_at
      ? new Date(parseISO(m.expires_at).getTime() + paused * 86400000).toISOString()
      : null;
    return patch(m, { status: "active", frozen_at: null, ...(expires ? { expires_at: expires } : {}) },
      paused > 0 ? `Back on — ${paused} day${paused === 1 ? "" : "s"} added` : "Back on");
  };

  const extend = async () => {
    if (!extending) return;
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) { toast.error("How many days?"); return; }
    const from = extending.expires_at ? parseISO(extending.expires_at) : new Date();
    const base = from.getTime() > Date.now() ? from : new Date();
    await patch(extending,
      { expires_at: new Date(base.getTime() + days * 86400000).toISOString(), status: "active" },
      `Extended ${days} days`);
    setExtending(null);
  };

  const cancel = async (m: Member) => {
    if (!(await confirm({
      title: `Cancel ${m.guest_name || "this pass"}?`,
      description: "They will not be able to book with it any more. You can put it back afterwards.",
      confirmLabel: "Cancel the pass", destructive: true,
    }))) return;
    patch(m, { status: "cancelled" }, "Cancelled");
  };

  const active = useMemo(() => members.filter((m) => m.status === "active").length, [members]);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" /> Your members ({active} active)
        </h3>
        <Button size="sm" onClick={() => { setResult(null); setOpen(true); }} disabled={passes.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New order
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Someone paid you for a pass? Add the order here and they get a code and a booking link by
        email, so they can book your classes with it.
      </p>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : members.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nobody yet. When a student pays you for a pass, add the order and the system does the rest.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Student", "Pass", "Left", "Expires", "Status", ""].map((h) => (
                  <th key={h} className="py-2 pr-3 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const days = m.expires_at ? differenceInCalendarDays(parseISO(m.expires_at), new Date()) : null;
                return (
                  <tr key={m.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{m.guest_name || "Guest"}</p>
                      {m.guest_email && <p className="text-[11px] text-muted-foreground">{m.guest_email}</p>}
                      {m.code && <p className="text-[11px] text-muted-foreground">Code {m.code}</p>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{m.name_snapshot}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {m.is_unlimited
                        ? <span className="text-muted-foreground">Unlimited</span>
                        : <span className={cn((m.credits_remaining ?? 0) === 0 && "text-destructive font-semibold")}>
                            {m.credits_remaining ?? 0}/{m.credits_total ?? 0}
                          </span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {m.status === "frozen"
                        ? <span className="text-sky-600 dark:text-sky-400">Paused</span>
                        : m.expires_at
                          ? <>
                              {format(parseISO(m.expires_at), "d MMM yyyy")}
                              <span className={cn("block text-[11px]", (days ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {days != null && (days < 0 ? `${-days}d ago` : `${days}d left`)}
                              </span>
                            </>
                          : <span className="text-muted-foreground">No expiry</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("rounded-full px-2 py-1 text-[11px] font-medium", STATUS_TONE[m.status] ?? "bg-muted text-muted-foreground")}>
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {m.status === "cancelled" ? (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => patch(m, { status: "active" }, "Back on")}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reactivate
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          {m.status === "frozen" ? (
                            <Button size="sm" variant="outline" className="h-8" onClick={() => unfreeze(m)}>
                              <Play className="h-3.5 w-3.5 mr-1" /> Unfreeze
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8" onClick={() => freeze(m)}>
                              <Snowflake className="h-3.5 w-3.5 mr-1" /> Freeze
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8"
                            onClick={() => { setExtending(m); setExtendDays("30"); }}>
                            <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Extend
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => cancel(m)}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New order */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{result ? "Pass is ready" : "New order — membership / pass"}</DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="space-y-3">
              <p className="spa-body-sm">
                <strong>{result.name}</strong> is active. The code and the booking link went to your
                student by email — here they are as well.
              </p>
              <div className="rounded-lg border border-border p-3">
                <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">Code</p>
                <p className="font-heading text-2xl font-semibold text-foreground">{result.code}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Booking link</p>
                <p className="font-body text-xs text-muted-foreground break-all">{result.link}</p>
                <Button size="sm" variant="outline" className="mt-2"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setResult(null); setOpen(false); }}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-body text-xs text-muted-foreground">First name *</label>
                  <Input autoFocus value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="font-body text-xs text-muted-foreground">Last name</label>
                  <Input value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Email *</label>
                <Input type="email" placeholder="student@example.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Phone</label>
                <Input placeholder="+506 8888 8888" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Membership / pass *</label>
                <select value={form.passId}
                  onChange={(e) => setForm({ ...form, passId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">Select…</option>
                  {passes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.price != null ? ` — ${usd(Number(p.price))}` : ""}
                      {p.classes_included == null ? " · unlimited" : ` · ${p.classes_included} classes`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="font-body text-[11px] text-muted-foreground">
                Adding the order says she already paid you. A code and a booking link are created
                automatically and emailed to her.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={createOrder} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Create order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Extend */}
      <Dialog open={!!extending} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Extend {extending?.guest_name || "this pass"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-body text-xs text-muted-foreground">Days to add</label>
              <Input type="number" min={1} value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setExtending(null)}>Cancel</Button>
              <Button size="sm" onClick={extend}>Extend</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </Card>
  );
}
