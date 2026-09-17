// deno-lint-ignore-file no-explicit-any
// Edge function: daily-agenda-email
//
// Emails tomorrow's agenda to the team every evening (pg_cron, x-cron-secret):
// the website bookings and the treatment-calendar entries for that day.
//
// It is read on a phone before bed, so the wide table drops its last two
// columns below 480px (`hide-sm`) instead of squeezing five columns into a
// screen that fits three.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailShell } from "../_shared/email-layout.ts";

const ADMIN_EMAIL = "info@spaholis.com";
const ADMIN_BACKUP_EMAIL = "spaholisma@gmail.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const CONFIRMED = ["paid", "pending", "confirmed", "completed"];

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hm = (t: string | null) => String(t ?? "").slice(0, 5);

/** `drop` marks the columns a phone does without. */
function row(cols: string[], drop: number[] = []): string {
  return `<tr>${cols.map((c, i) =>
    `<td class="${drop.includes(i) ? "hide-sm" : ""}" style="padding:6px 10px;border:1px solid #ddd;">${c}</td>`).join("")}</tr>`;
}
function head(cols: string[], drop: number[] = []): string {
  return `<tr>${cols.map((c, i) =>
    `<th class="${drop.includes(i) ? "hide-sm" : ""}" style="padding:6px 10px;border:1px solid #ddd;background:#f5f1ec;text-align:left;">${c}</th>`).join("")}</tr>`;
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sec, error: secErr } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!sec?.value || provided !== sec.value) {
    return json({
      ok: false, reason: "forbidden",
      dbg: { headerPresent: provided.length > 0, headerLen: provided.length, dbLen: (sec?.value || "").length, dbErr: secErr?.message ?? null },
    }, 403);
  }

  const nowCr = new Date(Date.now() - 6 * 3600_000);
  const tomorrow = new Date(nowCr.getTime() + 24 * 3600_000);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  const prettyDate = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const [{ data: bookings }, { data: entries }, { data: rooms }] = await Promise.all([
    admin.from("bookings")
      .select("guest_name, booking_time, status, room_id, title, services(title)")
      .eq("booking_date", dateStr).in("status", CONFIRMED).order("booking_time"),
    admin.from("admin_calendar_entries")
      .select("title, start_time, duration_minutes, is_all_day, room_id, is_offsite, offsite_location")
      .eq("calendar_type", "treatment").eq("entry_date", dateStr).order("start_time"),
    admin.from("rooms").select("id, name"),
  ]);
  const roomName = (id: string | null) => rooms?.find((r: any) => r.id === id)?.name ?? "";

  // On a phone: time, guest and service. Room and status wait for the laptop.
  const bookingRows = (bookings ?? []).map((b: any) =>
    row([hm(b.booking_time), b.guest_name ?? "", b.title || b.services?.title || "", roomName(b.room_id), b.status], [3, 4]));
  const entryRows = (entries ?? []).map((e: any) =>
    row([e.is_all_day ? "All day" : hm(e.start_time), e.title, e.is_offsite ? `Off-site${e.offsite_location ? " · " + e.offsite_location : ""}` : roomName(e.room_id)]));

  const html = emailShell(
    `Tomorrow's Agenda — ${prettyDate}`,
    `<h3 style="font-size:15px;margin:0 0 8px;">Website bookings (${bookingRows.length})</h3>
        ${bookingRows.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${head(["Time", "Guest", "Service", "Room", "Status"], [3, 4])}${bookingRows.join("")}</table>` : `<p class="fine" style="font-size:13px;color:#666;margin:0;">None.</p>`}
        <h3 style="font-size:15px;margin:20px 0 8px;">Calendar entries (${entryRows.length})</h3>
        ${entryRows.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${head(["Time", "Entry", "Where"])}${entryRows.join("")}</table>` : `<p class="fine" style="font-size:13px;color:#666;margin:0;">None.</p>`}`,
    { footer: "Holis Wellness Center · daily agenda", title: "Tomorrow's agenda" },
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ ok: false, reason: "email_config_missing" }, 500);
  const subject = `Agenda mañana — ${prettyDate} (${bookingRows.length} reservas)`;
  const send = (to: string) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  const r1 = await send(ADMIN_EMAIL);
  const r2 = await send(ADMIN_BACKUP_EMAIL);

  try {
    await admin.functions.invoke("notify-staff-push", {
      body: { title: "Agenda de mañana", body: `${prettyDate}: ${bookingRows.length} reservas · ${entryRows.length} entradas`, url: "/admin" },
    });
  } catch (_e) { /* non-fatal */ }

  return json({ ok: true, date: dateStr, bookings: bookingRows.length, entries: entryRows.length, emailOk: r1.ok && r2.ok });
});
