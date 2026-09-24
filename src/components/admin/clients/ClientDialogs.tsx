import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ContactPhoneField, initialPhone, phoneProblem, phoneToSave } from "@/components/admin/ContactPhoneField";
import { createClientAccount, saveClientDetails, type ClientDetails } from "./clientAccounts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Person = { name: string | null; email: string | null; phone: string | null };

/**
 * Edit a client's details, or give them a website account.
 *
 *   mode "edit"    — name, email and phone, corrected on everything that is theirs
 *   mode "create"  — a new website account; `person` pre-fills it when they are
 *                    already a client, and is empty for someone brand new
 */
export function ClientDetailsDialog({
  open, mode, person, clientKey, userId, onClose, onSaved,
}: {
  open: boolean;
  mode: "edit" | "create";
  person?: Person | null;
  clientKey?: string | null;
  userId?: string | null;
  onClose: () => void;
  onSaved: (newKey: string) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: person?.name ?? "",
      email: person?.email ?? "",
      phone: initialPhone(person?.phone),
    });
    setSendEmail(true);
  }, [open, person]);

  // An account signs in with its email, so it cannot go without one.
  const needsEmail = mode === "create" || !!userId;

  const save = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) { toast.error("The client's name is required"); return; }
    if (needsEmail && !email) { toast.error("An email is needed — it is what they sign in with"); return; }
    if (email && !EMAIL_RE.test(email)) { toast.error("That email address does not look right"); return; }
    const badPhone = phoneProblem(form.phone);
    if (badPhone) { toast.error(badPhone); return; }

    const details: ClientDetails = { name, email, phone: phoneToSave(form.phone, person?.phone) };
    setSaving(true);
    try {
      if (mode === "create") {
        const out = await createClientAccount(details, { sendEmail, clientKey });
        toast.success(
          sendEmail
            ? out.emailed
              ? `Account created — ${email} was sent a link to choose a password`
              : "Account created, but the email could not be sent. They can use \"Forgot password\" on the website."
            : "Account created. They can use \"Forgot password\" on the website to choose a password.",
        );
        onSaved(out.clientKey);
      } else {
        const key = await saveClientDetails(clientKey!, userId ?? null, details);
        toast.success("Client details saved everywhere");
        onSaved(key);
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "create"
    ? (clientKey ? "Create website account" : "New client account")
    : "Edit client";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "They choose their own password from the email we send — you never see or set it."
              : "Corrected on every membership, pass, class and treatment of theirs."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="client-name" className="font-body text-sm font-medium mb-1.5 block">Name</label>
            <Input id="client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} />
          </div>
          <div>
            <label htmlFor="client-email" className="font-body text-sm font-medium mb-1.5 block">
              Email{needsEmail ? "" : " (optional)"}
            </label>
            <Input id="client-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
            {mode === "edit" && userId && (
              <p className="text-xs text-muted-foreground font-body mt-1">This is also the email they sign in with.</p>
            )}
          </div>
          <div>
            <label htmlFor="client-phone" className="font-body text-sm font-medium mb-1.5 block">Phone</label>
            <ContactPhoneField id="client-phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} onFile={person?.phone} />
          </div>
          {mode === "create" && (
            <label className="flex items-start gap-2 font-body text-sm cursor-pointer">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} className="mt-0.5" />
              <span>Email them a link to choose their password</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create account" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Are you sure?" for suspending and deleting a login. */
export function ConfirmAccountAction({
  open, title, body, confirmLabel, destructive, busy, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
