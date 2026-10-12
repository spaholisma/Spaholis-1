import { BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  idDocumentProblem, localApplies, type IdDocument, type IdDocumentType,
} from "@/lib/localDiscount";

/**
 * The student's ID: a Costa Rican cédula or a passport / other ID. Required.
 *
 * Which one it is, the student says — a US passport has 9 digits too, so the
 * number alone cannot tell. With a teacher who has a local discount, a
 * cédula shows "Local discount applied" at once; anything else shows nothing
 * and the price stays as it is.
 */
export function IdDocumentField({
  value, onChange, localPct = 0, teacherFirst, idPrefix = "id-doc", className,
}: {
  value: IdDocument;
  onChange: (doc: IdDocument) => void;
  /** Her local discount (percent); 0 when she has none. */
  localPct?: number;
  teacherFirst?: string | null;
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const kinds: { value: IdDocumentType; label: string }[] = [
    { value: "cr_cedula", label: t("idDocument.crCedula", { defaultValue: "Costa Rican cédula" }) },
    { value: "other", label: t("idDocument.other", { defaultValue: "Passport or other ID" }) },
  ];
  const problem = idDocumentProblem(value);
  const local = localApplies(value, localPct);
  const cedula = value.type === "cr_cedula";
  return (
    <div className={cn("space-y-2", className)}>
      <p id={`${idPrefix}-label`} className="font-body text-xs font-medium text-muted-foreground">
        {t("idDocument.label", { defaultValue: "Your ID *" })}
      </p>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-label`} className="grid grid-cols-2 gap-2">
        {kinds.map((k) => {
          const on = value.type === k.value;
          return (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...value, type: k.value })}
              className={cn(
                "min-h-10 rounded-full border px-3 py-2 font-body text-xs font-medium leading-tight transition-colors",
                on ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/50",
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
      {value.type && (
        <Input
          id={`${idPrefix}-number`}
          aria-label={cedula
            ? t("idDocument.cedulaNumber", { defaultValue: "Cédula number" })
            : t("idDocument.otherNumber", { defaultValue: "Passport or ID number" })}
          placeholder={cedula
            ? t("idDocument.cedulaPlaceholder", { defaultValue: "Cédula number * (e.g. 1-0234-0567)" })
            : t("idDocument.otherPlaceholder", { defaultValue: "Passport or ID number *" })}
          value={value.number}
          inputMode={cedula ? "numeric" : "text"}
          autoComplete="off"
          maxLength={30}
          onChange={(e) => onChange({ ...value, number: e.target.value })}
          aria-invalid={!!problem}
          className={cn(problem && "border-destructive")}
        />
      )}
      {problem && (
        <p className="font-body text-[11px] text-destructive">
          {problem === "cedula"
            ? t("idDocument.cedulaProblem", { defaultValue: "A Costa Rican cédula has 9 digits, e.g. 1-0234-0567." })
            : t("idDocument.otherProblem", { defaultValue: "Please type the passport or ID number (letters and digits)." })}
        </p>
      )}
      {local && (
        <div className="flex items-start gap-2 rounded-xl bg-spa-sage/10 px-3 py-2" role="status">
          <BadgeCheck className="h-4 w-4 shrink-0 text-spa-sage mt-0.5" />
          <p className="font-body text-xs text-foreground">
            <strong>{t("idDocument.localApplied", { pct: localPct, defaultValue: "Local discount applied — {{pct}}% off" })}</strong>{" "}
            {t("idDocument.localAppliedWhy", { defaultValue: "for having a Costa Rican cédula." })}{" "}
            {t("idDocument.bringIt", {
              name: teacherFirst || t("idDocument.yourTeacher", { defaultValue: "your teacher" }),
              defaultValue: "Bring it with you: {{name}} may ask to see it in class.",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
