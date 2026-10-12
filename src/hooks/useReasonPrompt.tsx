import { useState, useCallback, useRef } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export interface ReasonAsk {
  title: string;
  description?: string;
  confirmLabel?: string;
  placeholder?: string;
  /** Show "Email the student" (checked to start with). */
  notifyLabel?: string;
}
export interface ReasonAnswer { reason: string; notify: boolean }

/** At least a few letters: the reason goes into the emails. */
export const reasonReady = (s: string) => s.trim().length >= 3;

/**
 * Like useConfirm, but the answer carries a reason (required) — for the things
 * a teacher does that reach other people by email: cancelling a class or a
 * private class, removing a student. Resolves null when she backs out.
 */
export function useReasonPrompt() {
  const [ask, setAsk] = useState<ReasonAsk | null>(null);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [tried, setTried] = useState(false);
  const resolver = useRef<((a: ReasonAnswer | null) => void) | null>(null);

  const askReason = useCallback((a: ReasonAsk) => {
    setAsk(a); setReason(""); setNotify(true); setTried(false);
    return new Promise<ReasonAnswer | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (answer: ReasonAnswer | null) => {
    setAsk(null);
    resolver.current?.(answer);
    resolver.current = null;
  };
  const submit = () => {
    if (!reasonReady(reason)) { setTried(true); return; }
    settle({ reason: reason.trim(), notify: ask?.notifyLabel ? notify : true });
  };
  const missing = tried && !reasonReady(reason);

  const dialog = (
    <AlertDialog open={!!ask} onOpenChange={(open) => { if (!open) settle(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
          {ask?.description && <AlertDialogDescription>{ask.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="font-body text-xs font-medium text-muted-foreground">Reason *</span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={ask?.placeholder ?? "e.g. I am unwell / not enough students / the studio is closed"}
              aria-invalid={missing}
              className={missing ? "border-destructive" : undefined}
            />
          </label>
          {missing && (
            <p role="alert" className="font-body text-xs text-destructive">
              Please write the reason — it goes in the emails.
            </p>
          )}
          {ask?.notifyLabel && (
            <label className="flex items-center gap-2 font-body text-sm text-foreground">
              <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              {ask.notifyLabel}
            </label>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(null)}>Back</AlertDialogCancel>
          <Button variant="destructive" onClick={submit}>{ask?.confirmLabel ?? "Confirm"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { askReason, reasonDialog: dialog };
}
