import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";

// Mirror of the row in public.email_templates. The generated Supabase types do
// not yet include this table, so we type it locally and cast `from(...)`.
interface EmailTemplate {
  id: string;
  template_key: string;
  label: string;
  category: string;
  description: string | null;
  subject: string;
  heading: string;
  body_html: string;
  enabled: boolean;
  updated_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  treatment: "Treatment appointments",
  class: "Yoga classes",
  offering_purchase: "Membership purchases (online)",
  offering_order: "Membership orders (schedule link)",
  client_notify: "Appointment reminders & reviews",
};

const CATEGORY_ORDER = ["offering_purchase", "offering_order", "class", "treatment", "client_notify"];

// Variables available to each category. {{details}} and {{button}} expand to
// HTML blocks the server builds from the real booking/offering data.
const CATEGORY_VARS: Record<string, string[]> = {
  treatment: ["guest_name", "reservation_id", "service_name", "therapist", "date", "time", "payment_status", "details"],
  class: ["guest_name", "reservation_id", "class_title", "instructor", "when", "location", "payment_status", "details", "button"],
  offering_purchase: ["first_name", "guest_name", "offering_name", "entitlement", "code", "details", "button"],
  offering_order: ["first_name", "guest_name", "offering_name", "entitlement", "code", "schedule_link", "details", "button"],
  client_notify: ["guest_name", "date", "time", "location", "button"],
};

// ---- Preview rendering (mirrors the edge functions so the preview is honest) ----
const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

function renderShell(heading: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;margin:0;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:28px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">${heading}</h1>
      </div>
      <div style="padding:28px;color:#2F2F2F;">${inner}</div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center · spaholis.com
      </div>
    </div>
  </body></html>`;
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;width:40%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`;
}
const table = (rows: string[]) => `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>`;

// Sample data + rendered {{details}}/{{button}} blocks used only for the preview.
function sampleVars(category: string): Record<string, string> {
  if (category === "treatment") {
    const details = table([
      row("Reservation ID", "A1B2C3D4"), row("Service", "Relaxing Massage"), row("Therapist", "Maria"),
      row("Date", "Monday, July 20, 2026"), row("Time", "10:00"), row("Payment Status", "Confirmed"), row("Total", "$80.00"),
    ]);
    return {
      guest_name: "Ana", reservation_id: "A1B2C3D4", service_name: "Relaxing Massage", therapist: "Maria",
      date: "Monday, July 20, 2026", time: "10:00", payment_status: "Confirmed", details, button: "",
    };
  }
  if (category === "class") {
    const details = table([
      row("Reservation ID", "A1B2C3D4"), row("Class", "Vinyasa Flow"), row("Instructor", "Luis"),
      row("When", "Monday, July 20, 2026, 8:00 AM"), row("Location", "Studio A"), row("Payment Status", "Paid"), row("Amount Paid", "$12.00"),
    ]);
    const button = `<p style="margin:0;"><a href="#" style="display:inline-block;background:#25D366;color:#ffffff;padding:10px 18px;border-radius:6px;font-size:14px;text-decoration:none;">Message us on WhatsApp</a></p>`;
    return {
      guest_name: "Ana", reservation_id: "A1B2C3D4", class_title: "Vinyasa Flow", instructor: "Luis",
      when: "Monday, July 20, 2026, 8:00 AM", location: "Studio A", payment_status: "Paid", details, button, whatsapp_url: "#",
    };
  }
  if (category === "client_notify") {
    const button = `<p style="text-align:center;margin:24px 0;"><a href="#" style="background:#2F2F2F;color:#F5F1EC;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:15px;display:inline-block;">Leave a review</a></p>`;
    return {
      guest_name: "Ana", date: "Monday, July 20", time: "10:00", location: "Holis Wellness Center",
      button, review_link: "#",
    };
  }
  // offering_purchase / offering_order
  const isOrder = category === "offering_order";
  const details = `<div style="background:#f3f6f6;border-radius:12px;padding:16px;margin:16px 0;">
    <p style="margin:0 0 4px;font-weight:bold;">5-Class Pass</p>
    <p style="margin:4px 0;color:#334155;font-size:14px;">5 class credits</p>
    <p style="margin:4px 0;color:#666;font-size:14px;">Valid until 8/20/2026</p>
    ${isOrder ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">Reference code: <strong style="letter-spacing:1px;">ABCD1234</strong></p>` : ""}
  </div>`;
  const button = `<p style="text-align:center;margin:24px 0;"><a href="#" style="background:#1d5b6a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:bold;font-size:16px;display:inline-block;">${isOrder ? "Schedule your classes" : "Browse classes"}</a></p>`;
  return {
    first_name: "Ana", guest_name: "Ana Lopez", offering_name: "5-Class Pass", entitlement: "5 class credits",
    code: "ABCD1234", schedule_link: "https://spaholis.com/classes?m=sample-token", details, button,
  };
}

function buildPreview(tpl: { heading: string; body_html: string }, category: string): string {
  const raw = sampleVars(category);
  const vars: Record<string, string> = {};
  // Escape scalar text vars; keep the pre-built HTML blocks raw.
  for (const [k, v] of Object.entries(raw)) vars[k] = ["details", "button"].includes(k) ? v : escHtml(v);
  return renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars));
}

export function AdminEmailTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<{ subject: string; heading: string; body_html: string; enabled: boolean }>({
    subject: "", heading: "", body_html: "", enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("email_templates" as any) as any)
      .select("*")
      .order("label");
    if (error) toast.error(error.message);
    setTemplates((data as EmailTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const by: Record<string, EmailTemplate[]> = {};
    for (const t of templates) (by[t.category] ??= []).push(t);
    return CATEGORY_ORDER.filter((c) => by[c]?.length).map((c) => ({ category: c, items: by[c] }));
  }, [templates]);

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setForm({ subject: t.subject, heading: t.heading, body_html: t.body_html, enabled: t.enabled });
  };

  const insertVar = (v: string) => {
    const token = `{{${v}}}`;
    const el = bodyRef.current;
    if (!el) { setForm((f) => ({ ...f, body_html: f.body_html + token })); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = form.body_html.slice(0, start) + token + form.body_html.slice(end);
    setForm((f) => ({ ...f, body_html: next }));
    // Restore focus + caret after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!form.subject.trim() || !form.heading.trim() || !form.body_html.trim()) {
      toast.error("Subject, heading and body are all required.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("email_templates" as any) as any)
      .update({
        subject: form.subject,
        heading: form.heading,
        body_html: form.body_html,
        enabled: form.enabled,
        updated_by: user?.id ?? null,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Email template saved");
    setEditing(null);
    load();
  };

  const previewHtml = editing ? buildPreview(form, editing.category) : "";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Client Emails</h3>
          <p className="font-body text-sm text-muted-foreground">
            Edit the automatic confirmation emails sent to clients. Changes take effect immediately.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category}>
            <h4 className="font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {CATEGORY_LABEL[category] ?? category}
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((t) => (
                <div key={t.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-body font-medium text-foreground">{t.label}</p>
                    {t.enabled ? (
                      <Badge variant="secondary" className="shrink-0">On</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">Off</Badge>
                    )}
                  </div>
                  {t.description && <p className="font-body text-xs text-muted-foreground">{t.description}</p>}
                  <p className="font-body text-xs text-muted-foreground truncate">
                    <span className="font-semibold">Subject:</span> {t.subject}
                  </p>
                  <div className="mt-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.label}</DialogTitle>
            <DialogDescription>
              {editing?.description} Use the variables below — they're filled in automatically when the email is sent.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Editor */}
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label className="font-body">Send this email</Label>
                    <p className="text-xs text-muted-foreground">Turn off to stop sending it entirely.</p>
                  </div>
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-body">Subject line</Label>
                  <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-body">Heading (top banner)</Label>
                  <Input value={form.heading} onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-body">Body</Label>
                  <Textarea
                    ref={bodyRef}
                    value={form.body_html}
                    onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                    className="font-mono text-xs min-h-[220px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-body text-xs text-muted-foreground">Insert a variable</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(CATEGORY_VARS[editing.category] ?? []).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        className="px-2 py-1 rounded-md bg-muted text-xs font-mono text-foreground hover:bg-muted/70 transition-colors"
                        title={`Insert {{${v}}}`}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{`{{details}}`}</span> and <span className="font-mono">{`{{button}}`}</span> expand
                    to the booking details table and the action button automatically.
                  </p>
                </div>
              </div>

              {/* Live preview */}
              <div className="space-y-1.5">
                <Label className="font-body flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Live preview (sample data)</Label>
                <iframe
                  title="Email preview"
                  className="w-full h-[520px] rounded-lg border border-border bg-white"
                  srcDoc={previewHtml}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
