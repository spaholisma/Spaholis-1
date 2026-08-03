import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Receipt, Send, Eye } from "lucide-react";
import { toast } from "sonner";

type Kind = "purchase" | "refund" | "commission";
type Currency = "CRC" | "USD";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatAmount(amount: string, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : "₡";
  const suffix = currency === "USD" ? " USD" : " CRC";
  const raw = amount.trim();
  const num = Number(raw.replace(/[,\s]/g, ""));
  const shown = raw !== "" && !Number.isNaN(num)
    ? num.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : raw;
  return `${symbol}${shown}${suffix}`;
}

// Mirrors the receipt box + shell built by the send-receipt edge function so
// the preview is faithful to what the customer receives.
function amountRowLabelFor(kind: Kind): string {
  if (kind === "refund") return "Amount refunded";
  if (kind === "commission") return "Commission paid";
  return "Amount paid";
}

function receiptBox(kind: Kind, amountLabel: string, paidTo: string, concept: string, date: string, reference: string): string {
  const amountColor = kind === "purchase" ? "#2F2F2F" : "#1d5b6a";
  const amountRowLabel = amountRowLabelFor(kind);
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#666;font-size:14px;">${esc(label)}</td>` +
    `<td style="padding:8px 0;text-align:right;font-size:14px;color:#2F2F2F;">${esc(value)}</td></tr>`;
  const rows: string[] = [];
  if (paidTo) rows.push(row("Paid to", paidTo));
  if (concept) rows.push(row("Concept", concept));
  if (date) rows.push(row("Date", date));
  if (reference) rows.push(row("Reference", reference));
  return `<div style="background:#f3f6f6;border-radius:12px;padding:20px;margin:20px 0;">
    <p style="margin:0 0 4px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;">${esc(amountRowLabel)}</p>
    <p style="margin:0 0 12px;font-size:28px;font-weight:bold;color:${amountColor};">${esc(amountLabel)}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8e8;">${rows.join("")}</table>
  </div>`;
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

const todayISO = () => new Date().toISOString().split("T")[0];

export function AdminSendReceipt() {
  const [kind, setKind] = useState<Kind>("purchase");
  const [to, setTo] = useState("");
  const [guestName, setGuestName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("CRC");
  const [concept, setConcept] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [ccAdmin, setCcAdmin] = useState(true);
  const [sending, setSending] = useState(false);

  // Human-friendly date for the email body (e.g. "August 3, 2026").
  const prettyDate = useMemo(() => {
    if (!date) return "";
    const d = new Date(`${date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }, [date]);

  const previewHtml = useMemo(() => {
    const amountLabel = formatAmount(amount || "0", currency);
    const firstName = guestName.trim().split(/\s+/)[0] || "there";
    const fullName = guestName.trim() || firstName;
    const box = receiptBox(kind, amountLabel, paidTo, concept, prettyDate, reference);
    if (kind === "commission") {
      const inner = `<p>Dear ${fullName},</p>
<p>This message confirms that Holis Wellness Center has issued the following commission payment for a direct sale referral.</p>
${box}
<p>Thank you for your continued partnership. If you have any questions regarding this payment, please reply to this email and we will be glad to assist.</p>
<p>Kind regards,<br>Holis Wellness Center</p>`;
      return renderShell("Commission Payment Confirmation", inner);
    }
    const heading = kind === "refund" ? "Your refund has been processed 🌿" : "Thank you for your purchase 🌿";
    const intro = kind === "refund"
      ? `Hi ${firstName}, we have processed a refund to you from Holis Wellness Center. Here are the details:`
      : `Hi ${firstName}, thank you for your purchase at Holis Wellness Center. Here is your receipt:`;
    const outro = kind === "refund"
      ? `If you have any questions about this refund, just reply to this email and we'll be happy to help. 🌺`
      : `We appreciate your trust and look forward to seeing you soon. 🌺`;
    return renderShell(heading, `<p>${intro}</p>${box}<p>${outro}</p>`);
  }, [kind, guestName, amount, currency, paidTo, concept, prettyDate, reference]);

  const canSend = EMAIL_RE.test(to.trim()) && amount.trim() !== "" && !sending;

  const send = async () => {
    if (!canSend) {
      toast.error("Enter a valid recipient email and an amount.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-receipt", {
        body: {
          kind, to: to.trim(), guest_name: guestName.trim(), amount: amount.trim(),
          currency, concept: concept.trim(), date: prettyDate, reference: reference.trim(),
          paid_to: paidTo.trim(), cc_admin: ccAdmin,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || "send_failed");
      toast.success(`Receipt sent to ${to.trim()}`);
    } catch (e: any) {
      toast.error(`Could not send receipt: ${e?.message || e}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <Receipt className="h-5 w-5 text-spa-sage" />
        <h3 className="font-heading text-xl text-foreground">Send a receipt</h3>
      </div>
      <p className="font-body text-sm text-muted-foreground mb-6">
        Email a customer a branded receipt for a purchase, or a receipt when you refund / hand back money.
        Edit the wording anytime in <span className="font-medium">Client Emails → Receipts</span>.
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-5">
          <div>
            <Label className="font-body text-sm">Receipt type</Label>
            <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-border p-1 bg-muted/40">
              {(["purchase", "refund", "commission"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-body font-medium transition-colors ${
                    kind === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k === "purchase" ? "Purchase" : k === "refund" ? "Refund (money handed out)" : "Commission"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r-email" className="font-body text-sm">Recipient email *</Label>
              <Input id="r-email" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === "commission" ? "hotel@example.com" : "client@email.com"} maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-name" className="font-body text-sm">Recipient name</Label>
              <Input id="r-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={kind === "commission" ? "Hotel Costa Verde" : "Ana López"} maxLength={120} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r-amount" className="font-body text-sm">Amount *</Label>
              <Input id="r-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" inputMode="decimal" maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label className="font-body text-sm">Currency</Label>
              <div className="mt-0.5 inline-flex rounded-xl border border-border p-1 bg-muted/40">
                {(["CRC", "USD"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-body font-medium transition-colors ${
                      currency === c ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c === "CRC" ? "₡ CRC" : "$ USD"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-concept" className="font-body text-sm">Concept / reason</Label>
            <Input id="r-concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={kind === "refund" ? "Refund for cancelled class" : kind === "commission" ? "Direct sale commission" : "Monthly membership"} maxLength={160} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-paidto" className="font-body text-sm">Paid to <span className="text-muted-foreground">(who receives the money)</span></Label>
            <Input id="r-paidto" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder={kind === "commission" ? "Hotel Costa Verde" : "Ana López"} maxLength={120} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r-date" className="font-body text-sm">Date</Label>
              <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-ref" className="font-body text-sm">Reference # <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="r-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="HOLIS-0042" maxLength={60} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch id="r-cc" checked={ccAdmin} onCheckedChange={setCcAdmin} />
            <Label htmlFor="r-cc" className="font-body text-sm text-muted-foreground">
              Send a copy to info@spaholis.com
            </Label>
          </div>

          <Button variant="spa" size="lg" className="w-full" disabled={!canSend} onClick={send}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending…" : "Send receipt"}
          </Button>
        </div>

        {/* Live preview */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span className="font-body text-sm">Preview</span>
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-white">
            <iframe title="Receipt preview" srcDoc={previewHtml} className="w-full h-[560px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
