import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Search, Download, Ticket } from "lucide-react";
import { formatSpaDate } from "@/lib/businessHours";
import { cn } from "@/lib/utils";

const sb = supabase as any;

interface Row {
  id: string; guest_name: string | null; guest_email: string | null; guest_phone: string | null;
  status: string; client_type: string | null; attended: boolean | null;
  class_schedule: { start_time: string; classes: { title: string | null } | null } | null;
}
interface Pass {
  guest_name: string | null; guest_email: string | null; pass_name: string | null;
  is_unlimited: boolean | null; credits_remaining: number | null;
  expires_at: string | null; status: string | null;
}
interface Student {
  key: string; name: string; email: string; phone: string;
  classes: number; attended: number; last: string | null; type: string | null;
}

/**
 * Everyone who has ever been in one of her classes, rolled up per person.
 *
 * The row-level rules already limit what comes back to her own sessions, so this
 * is simply "my students" — no filtering by hand.
 */
export function TeacherStudents() {
  const [rows, setRows] = useState<Row[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data }, { data: p }] = await Promise.all([
        sb.from("class_bookings")
          .select("id, guest_name, guest_email, guest_phone, status, client_type, attended, class_schedule(start_time, classes(title))")
          .order("created_at", { ascending: false }),
        sb.rpc("teacher_student_passes"),
      ]);
      setRows(((data ?? []) as Row[]));
      setPasses(((p ?? []) as Pass[]));
      setLoading(false);
    })();
  }, []);

  const students = useMemo(() => {
    const map = new Map<string, Student>();
    for (const r of rows) {
      if (r.status === "cancelled") continue;
      const email = (r.guest_email ?? "").trim().toLowerCase();
      const name = (r.guest_name ?? "Guest").trim();
      const key = email || name.toLowerCase();
      const when = r.class_schedule?.start_time ?? null;
      const cur = map.get(key);
      if (cur) {
        cur.classes += 1;
        if (r.attended) cur.attended += 1;
        if (when && (!cur.last || when > cur.last)) cur.last = when;
        if (!cur.type && r.client_type) cur.type = r.client_type;
        if (!cur.phone && r.guest_phone) cur.phone = r.guest_phone;
      } else {
        map.set(key, {
          key, name, email, phone: r.guest_phone ?? "",
          classes: 1, attended: r.attended ? 1 : 0, last: when, type: r.client_type,
        });
      }
    }
    return [...map.values()].sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""));
  }, [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) =>
      s.name.toLowerCase().includes(t) || s.email.includes(t) || s.phone.includes(t));
  }, [students, q]);

  const passFor = (s: Student) =>
    passes.find((p) => (p.guest_email ?? "").trim().toLowerCase() === s.email && s.email);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Student", "Email", "Phone", "Classes", "Attended", "Last class", "Type"].join(","),
      ...students.map((s) => [
        esc(s.name), esc(s.email), esc(s.phone), s.classes, s.attended,
        esc(s.last ? formatSpaDate(s.last) : ""), esc(s.type),
      ].join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" /> My students ({students.length})
        </h3>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!students.length}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-3">
        Everyone who has been in one of your classes, with how many times they came.
      </p>

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, email or phone" value={q}
          onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {students.length ? "Nobody matches that search." : "No students yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => {
            const pass = passFor(s);
            return (
              <div key={s.key} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground truncate">{s.name}</p>
                  {s.email && <p className="font-body text-xs text-muted-foreground truncate">{s.email}</p>}
                  {s.phone && <p className="font-body text-xs text-muted-foreground">{s.phone}</p>}
                  <p className="font-body text-[11px] text-muted-foreground mt-1">
                    {s.classes} class{s.classes === 1 ? "" : "es"} · {s.attended} attended
                    {s.last && <> · last {formatSpaDate(s.last)}</>}
                  </p>
                  {pass && (
                    <span className={cn(
                      "mt-1.5 inline-block rounded-full px-2 py-1 text-[11px] font-medium",
                      pass.status === "active"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                        : "bg-muted text-muted-foreground",
                    )}>
                      <Ticket className="h-3 w-3 inline mr-1" />
                      {pass.pass_name ?? "Pass"}
                      {pass.is_unlimited
                        ? " · unlimited"
                        : pass.credits_remaining != null ? ` · ${pass.credits_remaining} left` : ""}
                      {pass.status !== "active" && ` · ${pass.status}`}
                    </span>
                  )}
                </div>
                {s.type && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {s.type}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
