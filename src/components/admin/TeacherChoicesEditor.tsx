import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleanChoices, sameName } from "@/lib/privateOfferings";

/**
 * Admin → Teachers → Details: the private classes this teacher can pick by
 * name in her panel — the ones she asked for that are not on the class
 * schedule (GYROTONIC®, Couple's & Connection…). Only she sees them; she sets
 * the prices and the description herself. She cannot change this list.
 */
export function TeacherChoicesEditor({ teacherName, choices, onChange }: {
  teacherName: string;
  choices: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const list = cleanChoices(choices);
  const first = teacherName.split(/\s+/)[0];

  const add = () => {
    const t = draft.trim().replace(/\s+/g, " ");
    if (t.length < 2) { toast.error("Write the name of the class"); return; }
    if (t.length > 80) { toast.error("Keep the name under 80 characters"); return; }
    if (list.some((c) => sameName(c, t))) { toast.error(`${first} already has that one`); return; }
    onChange([...list, t]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private classes she can pick</p>
      <p className="text-[11px] text-muted-foreground">
        Classes not on the schedule that {first} gives privately. Only she sees them, in her panel under
        Private classes → Which class; she sets the prices.
      </p>
      {list.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-xs">
              {c}
              <button type="button" aria-label={`Remove ${c}`}
                onClick={() => onChange(list.filter((x) => x !== c))}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">None yet — she only sees her classes from the schedule.</p>
      )}
      <div className="flex items-center gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. GYROTONIC®" maxLength={80}
          aria-label={`New private class for ${first}`}
          className="h-8 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" size="sm" variant="outline" className="h-8 whitespace-nowrap" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
