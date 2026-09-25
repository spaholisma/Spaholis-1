import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, UserPlus, Mail, Phone, Pencil, Ban, RotateCcw, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCRC } from "@/lib/currency";
import { displayName, shortDate } from "./clientDirectory";
import { ClientDetailsDialog, ConfirmAccountAction, DeleteClientDialog, type DeleteScope } from "./ClientDialogs";
import { deleteAccount, deleteClient, suspendAccount, unsuspendAccount } from "./clientAccounts";
import { ClientAccess } from "./ClientAccess";
import { accessLabel, accessLevelOf } from "./accessLevels";

type History = {
  person: {
    name: string | null; email: string | null; phone: string | null;
    has_account: boolean; account_since: string | null; first_seen: string | null;
    user_id?: string | null; suspended?: boolean; last_sign_in?: string | null; is_staff?: boolean;
    /** Their roles, and whether the person looking may change them / is them. */
    roles?: string[]; can_manage_access?: boolean; is_self?: boolean;
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
//
// From here staff can also look after the person: correct their details,
// give them a website account, suspend it, or delete it.
export function ClientProfile({
  clientKey, onClose, onChanged, onDeleted,
}: {
  clientKey: string;
  onClose: () => void;
  /** Something about them changed; `newKey` is where they are found now. */
  onChanged?: (newKey: string) => void;
  /** They are gone: back to the list, read again. */
  onDeleted?: () => void;
}) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<null | "edit" | "create">(null);
  const [confirm, setConfirm] = useState<null | "suspend" | "unsuspend">(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase.rpc("admin_client_history" as any, { _key: clientKey });
      if (!live) return;
      if (error) { setError(error.message); return; }
      setError(null);
      setData(data as History);
    })();
    return () => { live = false; };
  }, [clientKey, version]);

  const changed = (newKey: string) => {
    if (newKey === clientKey) setVersion((v) => v + 1);
    onChanged?.(newKey);
  };

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
  const userId = p.has_account ? p.user_id ?? null : null;
  const suspended = !!p.suspended;
  // Staff logins are never changed from here.
  const isStaff = !!p.is_staff;
  const level = accessLevelOf(p.roles);
  const first = displayName(p).split(/\s+/)[0];

  const runDelete = async (scope: DeleteScope) => {
    setBusy(true);
    try {
      if (scope === "login" && userId) {
        await deleteAccount(userId);
        toast.success("Website account deleted — their history stays here");
        setDeleting(false);
        changed(clientKey);
        return;
      }
      const out = await deleteClient(clientKey, userId);
      toast.success(
        out.treatments > 0
          ? `${first} was deleted — their treatments are in the Trash for 30 days`
          : `${first} was deleted`,
      );
      setDeleting(false);
      (onDeleted ?? onClose)();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete this client");
    } finally {
      setBusy(false);
    }
  };

  const runAccountAction = async () => {
    if (!confirm || !userId) return;
    setBusy(true);
    try {
      if (confirm === "suspend") {
        await suspendAccount(userId);
        toast.success(`${first} can no longer sign in`);
      } else {
        await unsuspendAccount(userId);
        toast.success(`${first} can sign in again`);
      }
      setConfirm(null);
      changed(clientKey);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete that");
    } finally {
      setBusy(false);
    }
  };
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
          <div className="sm:text-right space-y-1">
            <div className="flex flex-wrap sm:justify-end gap-1">
              {p.has_account ? (
                <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" /> Website account since {shortDate(p.account_since)}</Badge>
              ) : (
                <Badge variant="outline" className="gap-1"><UserPlus className="h-3 w-3" /> Registered by staff</Badge>
              )}
              {suspended && <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Suspended</Badge>}
              {level !== "client" ? (
                <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> {accessLabel(level)}</Badge>
              ) : isStaff && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Staff</Badge>}
            </div>
            <p className="text-xs text-muted-foreground font-body">Client since {shortDate(p.first_seen)}</p>
            {p.has_account && (
              <p className="text-xs text-muted-foreground font-body">
                Last sign-in {p.last_sign_in ? shortDate(p.last_sign_in) : "never"}
              </p>
            )}
          </div>
        </div>

        {/* What staff can do for them */}
        {isStaff ? (
          <p className="mt-4 text-xs text-muted-foreground font-body">
            This is a staff login — it cannot be edited, suspended or deleted from Clients.
            {level !== "client" && p.can_manage_access && !p.is_self ? " To do that, first set their access to Client below." : ""}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            {!p.has_account && (
              <Button size="sm" variant="outline" onClick={() => setDialog("create")}>
                <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Create website account
              </Button>
            )}
            {userId && (suspended ? (
              <Button size="sm" variant="outline" onClick={() => setConfirm("unsuspend")}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reactivate account
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirm("suspend")}>
                <Ban className="h-3.5 w-3.5 mr-1.5" /> Suspend account
              </Button>
            ))}
            {/* One Delete: the dialog asks whether it is the login or everything. */}
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        )}

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

      {/* Who may use the Admin Panel — only for someone with a website login */}
      {userId && (
        <ClientAccess
          userId={userId}
          name={first}
          roles={p.roles ?? []}
          canManage={!!p.can_manage_access}
          isSelf={!!p.is_self}
          onChanged={() => changed(clientKey)}
        />
      )}

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

      <ClientDetailsDialog
        open={dialog !== null}
        mode={dialog ?? "edit"}
        person={p}
        clientKey={clientKey}
        userId={userId}
        onClose={() => setDialog(null)}
        onSaved={changed}
      />
      <DeleteClientDialog
        open={deleting}
        name={displayName(p)}
        hasAccount={!!userId}
        counts={{
          memberships: data.memberships.length,
          classes: data.classes.length,
          treatments: data.treatments.length,
          calendar: data.calendar.length,
        }}
        busy={busy}
        onConfirm={runDelete}
        onCancel={() => setDeleting(false)}
      />
      <ConfirmAccountAction
        open={confirm !== null}
        busy={busy}
        title={confirm === "suspend" ? `Suspend ${first}'s account?` : `Reactivate ${first}'s account?`}
        body={
          confirm === "suspend"
            ? "They will not be able to sign in to the website until you reactivate it. Nothing is deleted: their memberships, passes and bookings stay exactly as they are."
            : "They will be able to sign in to the website again."
        }
        confirmLabel={confirm === "suspend" ? "Suspend" : "Reactivate"}
        onConfirm={runAccountAction}
        onCancel={() => setConfirm(null)}
      />
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
