import { PhoneField, isPossiblePhoneNumber } from "@/components/booking/PhoneField";
import { toE164 } from "@/lib/phone";

// The phone box on the Admin's "edit customer" forms: the same country picker
// (flag + dial code) the booking pages use. It also copes with numbers typed
// long before there was a picker — they are read into it when they can be, and
// kept exactly as they were when they cannot.

/** What to put in the box when the form opens. */
export const initialPhone = (onFile: string | null | undefined) => toE164(onFile);

/** A number on file the picker could not read — shown so it is not lost. */
const unreadable = (onFile: string | null | undefined) =>
  !!String(onFile ?? "").trim() && !toE164(onFile);

/** What to save: the box, or — if it was left empty — an unreadable old number as it was. */
export function phoneToSave(value: string, onFile: string | null | undefined): string {
  if (value) return value;
  return unreadable(onFile) ? String(onFile).trim() : "";
}

/** A message when the number in the box cannot be a phone number, else null. */
export function phoneProblem(value: string): string | null {
  if (!value) return null;
  return isPossiblePhoneNumber(value) ? null : "That phone number does not look right";
}

export function ContactPhoneField({
  id, value, onChange, onFile,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onFile?: string | null;
}) {
  return (
    <div className="space-y-1">
      <PhoneField id={id} value={value} onChange={onChange} invalid={!!phoneProblem(value)} />
      {!value && unreadable(onFile) && (
        <p className="text-xs text-muted-foreground font-body">
          On file: <span className="font-medium text-foreground">{onFile}</span> — pick the country and type it
          above to update it. Left empty, it stays as it is.
        </p>
      )}
    </div>
  );
}
