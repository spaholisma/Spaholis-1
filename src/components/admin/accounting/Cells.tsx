import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { colones, evalAmount, money } from "@/lib/accounting";

// Spreadsheet cells for Contabilidad: they show the value like the Excel does
// ($83, ₡1,008,645, 45%) and save when the cell is left — only if something was
// typed, so stepping through a cell never writes anything back.

export const CELL =
  "h-8 w-full rounded-sm bg-transparent px-2 text-sm text-foreground border border-transparent hover:border-border focus:border-ring focus:bg-background focus:outline-none";
export const TD = "px-0.5 py-0.5 border-b border-r border-border/70";
export const TH = "px-2 py-2 text-left font-semibold border-b-2 border-r border-border whitespace-nowrap";

function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(value); }, [value]);
  return {
    draft,
    change: (v: string) => { dirty.current = true; setDraft(v); },
    take: () => { const was = dirty.current; dirty.current = false; return was; },
    reset: () => { dirty.current = false; setDraft(value); },
  };
}

const keys = (reset: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
  if (e.key === "Escape") { reset(); setTimeout(() => (e.target as HTMLInputElement).blur()); }
};

export function TextCell({
  value, onCommit, list, placeholder, className, ariaLabel,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  list?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const d = useDraft(value ?? "");
  return (
    <input
      className={cn(CELL, className)}
      value={d.draft}
      list={list}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => d.change(e.target.value)}
      onKeyDown={keys(d.reset)}
      onBlur={() => {
        if (!d.take()) return;
        const v = d.draft.replace(/\s+/g, " ").trim() || null;
        if (v !== (value ?? null)) onCommit(v);
      }}
    />
  );
}

export function DateCell({ value, onCommit, ariaLabel }: { value: string | null; onCommit: (v: string | null) => void; ariaLabel?: string }) {
  const d = useDraft(value ?? "");
  return (
    <input
      type="date"
      className={CELL}
      value={d.draft}
      aria-label={ariaLabel}
      onChange={(e) => d.change(e.target.value)}
      onKeyDown={keys(d.reset)}
      onBlur={() => {
        if (!d.take()) return;
        const v = d.draft || null;
        if (v !== (value ?? null)) onCommit(v);
      }}
    />
  );
}

/**
 * A number. `kind` decides how it reads when not being typed: usd ($83),
 * crc (₡1,008,645), pct (45%), plain (500). Accepts sums like 263953+56808.
 */
export function NumberCell({
  value, onCommit, kind = "usd", placeholder, className, ariaLabel, title,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  kind?: "usd" | "crc" | "pct" | "plain";
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const raw = value == null ? "" : String(Number(value));
  const d = useDraft(raw);
  const [focused, setFocused] = useState(false);
  const shown = (() => {
    if (focused || d.draft === "") return d.draft;
    const n = evalAmount(d.draft);
    if (n == null) return d.draft;
    return kind === "usd" ? money(n) : kind === "crc" ? colones(n) : kind === "pct" ? `${n}%` : String(n);
  })();
  return (
    <input
      className={cn(CELL, "text-right tabular-nums", className)}
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      onFocus={() => setFocused(true)}
      onChange={(e) => d.change(e.target.value)}
      onKeyDown={keys(d.reset)}
      onBlur={() => {
        setFocused(false);
        if (!d.take()) return;
        const n = d.draft.trim() === "" ? null : evalAmount(d.draft);
        if (d.draft.trim() !== "" && n == null) { d.reset(); return; } // not a number: put back what was there
        if (n !== (value == null ? null : Number(value))) onCommit(n);
        else d.reset();
      }}
    />
  );
}
