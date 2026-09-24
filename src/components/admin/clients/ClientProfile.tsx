import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, UserPlus, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCRC } from "@/lib/currency";
import { displayName, shortDate } from "./clientDirectory";

type History = {
  person: {
    name: string | null; email: string | null; phone: string | null;
    has_account: boolean; account_since: string | null; first_seen: string | null;
  } | null;
  memberships: any[];
  classes: any[];
  treatments: any[];
  calendar: any[];
};

const CANCELLED = new Set(["cancelled", "payment_failed"]);

const PAID_WITH: Record<string, string> = {
  membership: "Membership",
  credits: "Class pass",
  card: "Card",
  paypal: "PayPal",
  cash: "Cash",
  free: "Free",
  offering: "Pass",
};

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }) : "";

// Everything the studio knows about one person: who they are, every membership
// and pass they have had (and what is left on it), every class, every treatment,
// and what they have spent — whether or not they have a website account.
export function ClientProfile({ clientKey, onClose }: { clientKey: string; onClose: () => void }) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("admin_client_history" as any, { _key: clientKey });
      if (error) { setError(error.message); return; }
      setData(data as History);
    })();
  }, [clientKey]);

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> All clients</Button>
        <p className="text-sm text-destructive font-body">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="bg-card rounded-2xl border border-border p-5 text-sm text-muted-foreground font-body">Loading client…</div>;
  }

  const p = data.person ?? { name: null, email: null, phone: null, has_account: false, account_since: null, first_seen: null };
  const classesDone = data.classes.filter((c) => !CANCELLED.has(c.status));
  const treatmentsDone = data.treatments.filter((t) => !CANCELLED.has(t.status));
  const activeMemberships = data.memberships.filter((m) => m.status === "active");
  const total =
    data.memberships.filter((m) => m.status !== "cancelled").reduce((s, m) => s + Number(m.price_paid ?? 0), 0) +
    classesDone.filter((c) => c.payment_status === "paid").reduce((s, c) => s + Number(c.price ?? 0), 0) +
    treatmentsDone.reduce((s, t) => s + Number(t.price ?? 0), 0);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> All clients</Button>

      {/* Who they are */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-medium text-foreground break-words">{displayName(p)}</h3>
            <div className="mt-2 space-y-1 font-body text-sm text-muted-foreground">
              {p.email && <div className="flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0" /> {p.email}</div>}
              {p.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" /> {p.phone}</div>}
              {!p.email && !p.phone && <div>No contact details on file</div>}
            </div>
          </div>
          <div className="text-right space-y-1">
            {p.has_account ? (
              <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" /> Website account since {shortDate(p.account_since)}</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><UserPlus className="h-3 w-3" /> Registered by staff</Badge>
            )}
            <p className="text-xs text-muted-foreground font-body">Client since {shortDate(p.first_seen)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            ["Classes", classesDone.length],
            ["Treatments", treatmentsDone.length],
            ["Active memberships", activeMemberships.length],
            ["Total", formatCRC(total)],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl bg-muted/40 px-3 py-2.5">
              <p className="text-[11px] font-body uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-heading text-lg text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Memberships and passes */}
      <Section title="Memberships & passes" count={data.memberships.length} empty="No memberships or passes.">
        <Table head={["Membership", "Status", "Price", "Left", "Used", "Started", "Expires", "Code"]}>
          {data.memberships.map((m) => (
            <tr key={m.id} className="align-top">
              <Td strong>{m.name}</Td>
              <Td><StatusBadge status={m.status} /></Td>
              <Td>{formatCRC(m.price_paid)}</Td>
              <Td>{m.is_unlimited ? "Unlimited" : m.credits_total != null ? `${m.credits_remaining ?? 0} / ${m.credits_total}` : "—"}</Td>
              <Td>{m.classes_used ?? 0} {m.classes_used === 1 ? "class" : "classes"}</Td>
              <Td>{shortDate(m.starts_at ?? m.created_at)}</Td>
              <Td>{m.expires_at ? shortDate(m.expires_at) : "No expiry"}</Td>
              <Td mono>{m.code || "—"}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Classes */}
      <Section title="Classes" count={data.classes.length} empty="No classes booked.">
        <Table head={["Date", "Class", "Teacher", "Status", "Paid with", "Price"]}>
          {data.classes.map((c) => (
            <tr key={c.id} className={cn("align-top", CANCELLED.has(c.status) && "opacity-60")}>
              <Td>{shortDate(c.starts_at)} <span className="text-muted-foreground">{timeOf(c.starts_at)}</span></Td>
              <Td strong>{c.class || "—"}</Td>
              <Td>{c.instructor || "—"}</Td>
              <Td><StatusBadge status={c.status} /></Td>
              <Td>{c.pass ? `${c.pass}` : PAID_WITH[c.payment_method] ?? (c.payment_method || "—")}</Td>
              <Td>{c.pass ? "—" : formatCRC(c.price)}{c.coupon ? <span className="text-xs text-muted-foreground"> · {c.coupon}</span> : null}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Treatments */}
      <Section title="Treatments" count={data.treatments.length} empty="No treatments booked.">
        <Table head={["Date", "Treatment", "Status", "Price", "Notes"]}>
          {data.treatments.map((t) => (
            <tr key={t.id} className={cn("align-top", CANCELLED.has(t.status) && "opacity-60")}>
              <Td>{shortDate(t.date)} <span className="text-muted-foreground">{String(t.time ?? "").slice(0, 5)}</span></Td>
              <Td strong>{t.service || "—"}</Td>
              <Td><StatusBadge status={t.status} /></Td>
              <Td>{formatCRC(t.price)}{t.coupon ? <span className="text-xs text-muted-foreground"> · {t.coupon}</span> : null}</Td>
              <Td>{t.notes || "—"}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Calendar entries with their name on them */}
      {data.calendar.length > 0 && (
        <Section title="On the calendar" count={data.calendar.length} empty="">
          <Table head={["Date", "Entry", "Notes"]}>
            {data.calendar.map((e) => (
              <tr key={e.id} className="align-top">
                <Td>{shortDate(e.date)} <span className="text-muted-foreground">{String(e.time ?? "").slice(0, 5)}</span></Td>
                <Td strong>{e.title}</Td>
                <Td>{e.notes || "—"}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h4 className="font-heading text-base font-medium text-foreground">{title}</h4>
        <span className="text-xs font-body text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground font-body">{empty}</p> : children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="text-left px-5 py-2.5 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, strong, mono }: { children: React.ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <td className={cn(
      "px-5 py-2.5 font-body text-sm",
      strong ? "text-foreground font-medium" : "text-muted-foreground",
      mono && "font-mono tracking-wide",
    )}>
      {children}
    </td>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "confirmed" || status === "completed" || status === "paid" || status === "booked"
      ? "bg-spa-sage/15 text-spa-sage"
      : CANCELLED.has(status)
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-body font-medium capitalize whitespace-nowrap", tone)}>{String(status).replace(/_/g, " ")}</span>;
}
