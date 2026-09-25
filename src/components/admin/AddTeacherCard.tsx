import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, extractInvokeErrorMessage } from "@/lib/invokeEdgeFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  looksLikeEmail, namesOnSchedule, scheduleMatch, similarNames,
  type ScheduleName, type ScheduleSession,
} from "@/lib/teacherNames";

const sb = supabase as any;
// Names seen on classes from two months back onwards.
const LOOK_BACK_DAYS = 60;

/**
 * Add a teacher so that it works the first time: her name as the schedule
 * spells it (picked from the schedule, not typed from memory), the email she
 * signs in with, her studio rent — and, when she has no website account yet,
 * an invitation to make one. She chooses her own password; the database links
 * the account to her the moment it exists and emails her how to open her
 * Teacher Panel.
 */
export function AddTeacherCard({ teacherNames, onAdded }: { teacherNames: string[]; onAdded: () => void }) {
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rate, setRate] = useState("35");
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const since = new Date(Date.now() - LOOK_BACK_DAYS * 86400000).toISOString();
    sb.from("class_schedule")
      .select("instructor, start_time, is_cancelled, classes(instructor)")
      .gte("start_time", since)
      .then(({ data }: any) => setSessions((data ?? []) as ScheduleSession[]));
  }, []);

  const names = useMemo(() => namesOnSchedule(sessions, new Date(), teacherNames), [sessions, teacherNames]);
  const match = scheduleMatch(name, names);
  const similar = similarNames(name, names);
  const trimmed = name.trim();
  const canAdd = trimmed.length >= 2 && looksLikeEmail(email) && Number(rate) >= 0 && !busy;

  const add = async () => {
    if (!canAdd) return;
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_add_teacher", {
        _name: trimmed, _email: email.trim(), _rate: Number(rate) || 0,
      });
      if (error) { toast.error(error.message); return; }

      if ((data as any)?.linked) {
        toast.success(`${trimmed} added and linked to her account — we've emailed her how to open her Teacher Panel`);
      } else if (invite) {
        // Her login; the database links it to her and sends the welcome.
        const res = await invokeEdgeFunction("admin-clients", {
          body: { action: "create", full_name: trimmed, email: email.trim(), send_email: false },
        });
        if (res.ok) {
          toast.success(`${trimmed} added — we've emailed her an invitation to choose her password and open her Teacher Panel`);
        } else {
          toast.warning(
            `${trimmed} was added, but her login could not be made: ${extractInvokeErrorMessage(res, "unknown error")}. ` +
            `She is linked as soon as she signs up with ${email.trim()}.`,
          );
        }
      } else {
        toast.success(`${trimmed} added. She is linked as soon as she signs up with ${email.trim()}.`);
      }
      setName(""); setEmail(""); setRate("35"); setInvite(true);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add a teacher</p>

      {names.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">On the class schedule — tap her name:</p>
          <div className="flex flex-wrap gap-1.5">
            {names.map((n) => (
              <NameChip key={n.name} n={n} picked={match?.name === n.name} onPick={() => setName(n.name)} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem]">
        <div>
          <label htmlFor="teacher-name" className="text-[11px] text-muted-foreground">Her name, as on the class schedule</label>
          <Input id="teacher-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Evelina" className="h-9" />
        </div>
        <div>
          <label htmlFor="teacher-email" className="text-[11px] text-muted-foreground">Her email — she signs in with it</label>
          <Input id="teacher-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="her@email.com" className="h-9" />
        </div>
        <div>
          <label htmlFor="teacher-rate" className="text-[11px] text-muted-foreground">Rent per class ($)</label>
          <Input id="teacher-rate" type="number" min={0} step="1" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9" />
        </div>
      </div>

      {/* What her name means for her classes */}
      {trimmed.length >= 2 && (
        <div className="space-y-1">
          {match ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                On the schedule: {match.upcoming} upcoming class{match.upcoming === 1 ? "" : "es"}
                {match.recent > 0 ? ` and ${match.recent} in the last two months` : ""} — they count as hers.
              </span>
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                No class uses this name yet. Her classes appear once a session is set to “{trimmed}” in Calendars → Classes.
              </span>
            </p>
          )}
          {similar.map((s) => (
            <p key={s.name} className="text-xs text-amber-700 dark:text-amber-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Also on the schedule as “{s.name}” ({s.upcoming} upcoming). Those count as hers only once they are
                renamed to “{trimmed}” in Calendars → Classes.
              </span>
            </p>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox checked={invite} onCheckedChange={(v) => setInvite(v === true)} className="mt-0.5" aria-label="Invite her" />
        <span className="text-xs">
          <span className="font-medium text-foreground">Create her website login and email her an invitation</span>
          <span className="block text-muted-foreground">
            She chooses her own password — nobody on the team sees it — and goes straight to her Teacher Panel.
            If this email already has an account, it is linked instead and she is emailed how to open her panel.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button size="sm" onClick={add} disabled={!canAdd}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Add teacher
        </Button>
      </div>
    </Card>
  );
}

function NameChip({ n, picked, onPick }: { n: ScheduleName; picked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "px-2.5 py-1 rounded-full border text-xs font-body transition-colors",
        picked ? "bg-foreground text-background border-foreground" : "border-border text-foreground hover:bg-muted/40",
      )}
    >
      {n.name} <span className="opacity-70">· {n.upcoming} upcoming</span>
    </button>
  );
}
