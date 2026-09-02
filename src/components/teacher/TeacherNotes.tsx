import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Save, NotebookPen, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Note {
  id: string;
  entry_date: string;
  student_name: string | null;
  class_label: string | null;
  amount: number | null;
  paid: boolean;
  note: string | null;
}

const todayCR = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());

const blankRow = () => ({
  entry_date: todayCR(), student_name: "", class_label: "", amount: "", note: "",
});

/**
 * The teacher's notebook: a spreadsheet she owns.
 *
 * This is deliberately free text rather than anything wired to bookings — it is
 * where she writes "paid me half", "owes 5000 for last week", "Ana covered for
 * me". Holis never charges from it and never reads money out of it.
 */
export function TeacherNotes({ teacherId }: { teacherId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(blankRow());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(blankRow());
  const [filter, setFilter] = useState<"all" | "unpaid">("all");
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("teacher_notes").select("*")
      .eq("teacher_id", teacherId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setNotes(((data ?? []) as Note[]));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft.student_name.trim() && !draft.note.trim()) {
      toast.error("Write a name or a note first");
      return;
    }
    setSaving(true);
    const { error } = await sb.from("teacher_notes").insert({
      teacher_id: teacherId,
      entry_date: draft.entry_date || todayCR(),
      student_name: draft.student_name.trim() || null,
      class_label: draft.class_label.trim() || null,
      amount: draft.amount === "" ? null : Number(draft.amount),
      note: draft.note.trim() || null,
      paid: false,
    });
    if (error) toast.error(error.message);
    else { setDraft(blankRow()); load(); }
    setSaving(false);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    const { error } = await sb.from("teacher_notes").update({
      entry_date: editDraft.entry_date || todayCR(),
      student_name: editDraft.student_name.trim() || null,
      class_label: editDraft.class_label.trim() || null,
      amount: editDraft.amount === "" ? null : Number(editDraft.amount),
      note: editDraft.note.trim() || null,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { setEditingId(null); load(); }
    setSaving(false);
  };

  const togglePaid = async (n: Note) => {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, paid: !x.paid } : x)));
    const { error } = await sb.from("teacher_notes").update({ paid: !n.paid }).eq("id", n.id);
    if (error) {
      toast.error(error.message);
      setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, paid: n.paid } : x)));
    }
  };

  const remove = async (n: Note) => {
    if (!(await confirm({
      title: "Delete this line?",
      confirmLabel: "Delete",
      destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_notes").delete().eq("id", n.id);
    if (error) toast.error(error.message); else load();
  };

  const shown = useMemo(
    () => (filter === "unpaid" ? notes.filter((n) => !n.paid) : notes),
    [notes, filter],
  );
  const owed = useMemo(
    () => notes.filter((n) => !n.paid).reduce((s, n) => s + Number(n.amount ?? 0), 0),
    [notes],
  );

  /** A spreadsheet she can open in Excel, since this is her own bookkeeping. */
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Date", "Student", "Class", "Amount", "Paid", "Note"].join(","),
      ...notes.map((n) => [
        esc(n.entry_date), esc(n.student_name), esc(n.class_label),
        esc(n.amount ?? ""), esc(n.paid ? "yes" : "no"), esc(n.note),
      ].join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-notes-${todayCR()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <NotebookPen className="h-4 w-4" /> My notebook
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter(filter === "all" ? "unpaid" : "all")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium border",
              filter === "unpaid"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-500 border-amber-500/40"
                : "bg-muted text-muted-foreground border-border")}
          >
            {filter === "unpaid" ? "Showing unpaid" : "Showing all"}
          </button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!notes.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Yours alone — who still owes you, who pays next class, who covered for you.
        Holis never charges anything from these lines.
        {owed > 0 && <span className="ml-1 font-medium text-foreground">Outstanding: {usd(owed)}</span>}
      </p>

      {/* New line */}
      <div className="rounded-lg border border-spa-sage/40 bg-spa-sage/5 p-3 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-[130px_1fr_1fr_100px_auto] gap-2">
          <Input type="date" value={draft.entry_date} className="h-9"
            onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} />
          <Input placeholder="Student" value={draft.student_name} className="h-9"
            onChange={(e) => setDraft({ ...draft, student_name: e.target.value })} />
          <Input placeholder="Class" value={draft.class_label} className="h-9"
            onChange={(e) => setDraft({ ...draft, class_label: e.target.value })} />
          <Input type="number" placeholder="$" value={draft.amount} className="h-9"
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <Button size="sm" className="h-9" onClick={add} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <Input placeholder="Note — e.g. pays me next class, Ana covered for me" value={draft.note}
          className="h-9 mt-2"
          onKeyDown={(e) => e.key === "Enter" && add()}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === "unpaid" ? "Nothing outstanding." : "Nothing written down yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Date", "Student", "Class", "Amount", "Note", ""].map((h) => (
                  <th key={h} className="py-2 pr-3 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((n) => {
                const editing = editingId === n.id;
                return (
                  <tr key={n.id} className={cn("border-b border-border/60 align-top", n.paid && "opacity-55")}>
                    {editing ? (
                      <>
                        <td className="py-2 pr-3"><Input type="date" className="h-8 w-[130px]" value={editDraft.entry_date}
                          onChange={(e) => setEditDraft({ ...editDraft, entry_date: e.target.value })} /></td>
                        <td className="py-2 pr-3"><Input className="h-8" value={editDraft.student_name}
                          onChange={(e) => setEditDraft({ ...editDraft, student_name: e.target.value })} /></td>
                        <td className="py-2 pr-3"><Input className="h-8" value={editDraft.class_label}
                          onChange={(e) => setEditDraft({ ...editDraft, class_label: e.target.value })} /></td>
                        <td className="py-2 pr-3"><Input type="number" className="h-8 w-24" value={editDraft.amount}
                          onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })} /></td>
                        <td className="py-2 pr-3"><Input className="h-8" value={editDraft.note}
                          onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} /></td>
                        <td className="py-2 whitespace-nowrap">
                          <Button size="sm" className="h-8" onClick={() => saveEdit(n.id)} disabled={saving}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>Cancel</Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{n.entry_date}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{n.student_name || "—"}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{n.class_label || "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {n.amount == null ? "—" : usd(Number(n.amount))}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{n.note || "—"}</td>
                        <td className="py-2 whitespace-nowrap">
                          <button onClick={() => togglePaid(n)}
                            className={cn("rounded-full px-2 py-1 text-[11px] font-medium border mr-1",
                              n.paid
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-500 border-amber-500/40")}>
                            {n.paid ? "Paid" : "Owes"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(n.id);
                              setEditDraft({
                                entry_date: n.entry_date, student_name: n.student_name ?? "",
                                class_label: n.class_label ?? "", amount: n.amount == null ? "" : String(n.amount),
                                note: n.note ?? "",
                              });
                            }}
                            className="font-body text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline mr-2">
                            Edit
                          </button>
                          <button onClick={() => remove(n)} className="text-destructive align-middle">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}
