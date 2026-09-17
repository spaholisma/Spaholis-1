// deno-lint-ignore-file no-explicit-any
// Edge function: send-receipt
//
// Admin-only. Sends a branded receipt to a recipient using the editable
// receipt_purchase / receipt_refund / receipt_commission / receipt_teacher
// templates. The caller must be a super_admin or manager (verified from their
// JWT). Body:
// { kind: 'purchase'|'refund'|'commission'|'teacher', to, guest_name, amount,
//   currency, concept, date, reference, paid_to, cc_admin? }

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailShell } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_BACKUP_EMAIL = "info@spaholis.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS = ["purchase", "refund", "commission", "teacher"];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

function renderShell(heading: string, inner: string): string {
  return emailShell(heading, inner);
}

function formatAmount(amount: string, currency: string): string {
  const cur = String(currency || "CRC").toUpperCase();
  const symbol = cur === "USD" ? "$" : "₡";
  const suffix = cur === "USD" ? " USD" : " CRC";
  const raw = String(amount ?? "").trim();
  const num = Number(raw.replace(/[,\s]/g, ""));
  const shown = raw !== "" && !Number.isNaN(num)
    ? num.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : raw;
  return `${symbol}${shown}${suffix}`;
}

function amountRowLabelFor(kind: string): string {
  if (kind === "refund") return "Amount refunded";
  if (kind === "commission") return "Commission paid";
  if (kind === "teacher") return "Payment amount";
  return "Amount paid";
}

function receiptBox(kind: string, amountLabel: string, paidTo: string, concept: string, date: string, reference: string): string {
  const amountColor = kind === "purchase" ? "#2F2F2F" : "#1d5b6a";
  const rows: string[] = [];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#666;font-size:14px;">${esc(label)}</td>` +
    `<td style="padding:8px 0;text-align:right;font-size:14px;color:#2F2F2F;">${esc(value)}</td></tr>`;
  if (paidTo) rows.push(row("Paid to", paidTo));
  if (concept) rows.push(row("Concept", concept));
  if (date) rows.push(row("Date", date));
  if (reference) rows.push(row("Reference", reference));
  return `<div style="background:#f3f6f6;border-radius:12px;padding:20px;margin:20px 0;">
    <p style="margin:0 0 4px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;">${esc(amountRowLabelFor(kind))}</p>
    <p style="margin:0 0 12px;font-size:28px;font-weight:bold;color:${amountColor};">${esc(amountLabel)}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8e8;">${rows.join("")}</table>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  // --- Admin authorization (caller's JWT) ---
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, reason: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ ok: false, reason: "unauthorized" }, 401);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "super_admin" || r.role === "manager");
  if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);

  // --- Payload ---
  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const kind = KINDS.includes(body.kind) ? body.kind : "purchase";
  const to = String(body.to || "").trim();
  const guestName = String(body.guest_name || "").trim();
  const amount = String(body.amount || "").trim();
  const currency = String(body.currency || "CRC").trim();
  const concept = String(body.concept || "").trim();
  const date = String(body.date || "").trim();
  const reference = String(body.reference || "").trim();
  const paidTo = String(body.paid_to || "").trim();
  const ccAdmin = body.cc_admin !== false;

  if (!to || !EMAIL_RE.test(to)) return json({ ok: false, reason: "invalid_recipient" }, 400);
  if (!amount) return json({ ok: false, reason: "missing_amount" }, 400);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  if (!RESEND_API_KEY) return json({ ok: false, reason: "email_config_missing" }, 500);

  const { data: tpl } = await admin.from("email_templates")
    .select("subject, heading, body_html, enabled").eq("template_key", `receipt_${kind}`).maybeSingle();
  if (!tpl || tpl.enabled === false) return json({ ok: false, reason: "template_unavailable" }, 409);

  const amountLabel = formatAmount(amount, currency);
  const firstName = guestName.split(/\s+/)[0] || "there";
  // Commission emails address a business by full name; consumer/teacher receipts
  // use the first name for a warmer greeting.
  const greetingName = kind === "commission" ? (guestName || firstName) : firstName;
  const vars: Record<string, string> = {
    guest_name: esc(greetingName),
    full_name: esc(guestName || firstName),
    amount: esc(amountLabel),
    paid_to: esc(paidTo),
    concept: esc(concept),
    date: esc(date),
    reference: esc(reference),
    receipt_box: receiptBox(kind, amountLabel, paidTo, concept, date, reference),
  };

  const subject = interpolate(tpl.subject, vars);
  const html = renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars));

  async function send(recipient: string, subj: string): Promise<boolean> {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM_ADDRESS, to: recipient, subject: subj, html }),
      });
      return r.ok;
    } catch (e) {
      console.error("[send-receipt] send failed", recipient, e);
      return false;
    }
  }

  const ok = await send(to, subject);
  if (ccAdmin && ADMIN_BACKUP_EMAIL.toLowerCase() !== to.toLowerCase()) {
    await send(ADMIN_BACKUP_EMAIL, `[Receipt copy] ${subject}`);
  }

  if (!ok) return json({ ok: false, reason: "send_failed" }, 502);
  return json({ ok: true });
});
