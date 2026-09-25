import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmAccountAction } from "./ClientDialogs";
import {
  ACCESS_LEVELS, accessChangeWarning, accessLabel, accessLevelOf, setAccessLevel, type AccessLevel,
} from "./accessLevels";

// Who can use the Admin Panel, set from the client's own profile. Only an Admin
// can change it, never their own, and the database holds to the same rules.
export function ClientAccess({
  userId, name, roles, canManage, isSelf, onChanged,
}: {
  userId: string;
  name: string;
  roles: string[];
  /** The person looking is an Admin. */
  canManage: boolean;
  /** The person looking is looking at themselves. */
  isSelf: boolean;
  onChanged: () => void;
}) {
  const current = accessLevelOf(roles);
  const [picked, setPicked] = useState<AccessLevel>(current);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(current); }, [current]);

  const editable = canManage && !isSelf;
  const isTeacher = roles.includes("teacher");

  const save = async () => {
    setBusy(true);
    try {
      await setAccessLevel(userId, picked);
      toast.success(picked === "client"
        ? `${name} no longer has access to the Admin Panel`
        : `${name} is now ${accessLabel(picked)}`);
      setConfirming(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change their access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading text-base font-medium text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-spa-sage" /> Access to the Admin Panel
        </h4>
        <span className="text-xs font-body text-muted-foreground">
          Now: <span className="font-medium text-foreground">{accessLabel(current)}</span>
          {isTeacher ? " · also a teacher" : ""}
        </span>
      </div>

      {!canManage ? (
        <p className="mt-2 text-xs font-body text-muted-foreground">Only an Admin can change who has access.</p>
      ) : isSelf ? (
        <p className="mt-2 text-xs font-body text-muted-foreground">This is you. Another Admin has to change your access.</p>
      ) : null}

      <div role="radiogroup" aria-label="Access level" className="mt-3 grid gap-2 sm:grid-cols-2">
        {ACCESS_LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={picked === l.id}
            disabled={!editable || busy}
            onClick={() => setPicked(l.id)}
            className={cn(
              "text-left rounded-xl border p-3 transition-colors",
              picked === l.id ? "border-foreground bg-muted/40" : "border-border hover:bg-muted/20",
              (!editable || busy) && "cursor-not-allowed opacity-70 hover:bg-transparent",
            )}
          >
            <span className="block font-body text-sm font-medium text-foreground">{l.label}</span>
            <span className="block font-body text-xs text-muted-foreground mt-0.5">{l.description}</span>
          </button>
        ))}
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={picked === current || busy} onClick={() => setConfirming(true)}>
            Save access
          </Button>
          <p className="text-xs font-body text-muted-foreground">
            It takes effect the next time they open the Admin Panel.
          </p>
        </div>
      )}

      <ConfirmAccountAction
        open={confirming}
        busy={busy}
        title={picked === "client" ? `Remove ${name}'s access?` : `Make ${name} ${accessLabel(picked)}?`}
        body={accessChangeWarning(name, picked)}
        confirmLabel={picked === "client" ? "Remove access" : `Make ${accessLabel(picked)}`}
        destructive={picked === "admin" || picked === "client"}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
