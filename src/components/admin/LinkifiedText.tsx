import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Only http(s) and bare www links are recognised. Anything else — most
 * importantly `javascript:` — never becomes an anchor, so pasted text can't
 * turn into a scripted link.
 */
const URL_RE = /(https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)/gi;

/** Trailing sentence punctuation belongs to the sentence, not the URL. */
const trimTrailing = (url: string): string => url.replace(/[.,;:!?)\]}>'"]+$/, "");

/** The links found in a block of text, normalised to absolute https URLs. */
export function extractLinks(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = trimTrailing(match[0]);
    if (!url) continue;
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

/** Render text with any pasted URLs turned into clickable links. */
export function LinkifiedText({
  text,
  className,
  linkClassName,
}: {
  text: string | null | undefined;
  className?: string;
  linkClassName?: string;
}) {
  if (!text) return null;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const url = trimTrailing(match[0]);
    if (!url) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // The note often sits inside a clickable row; opening the link
        // shouldn't also open the entry.
        onClick={(e) => e.stopPropagation()}
        className={cn("underline underline-offset-2 hover:opacity-70 break-all", linkClassName)}
      >
        {url}
      </a>,
    );
    cursor = start + url.length;
  }
  parts.push(text.slice(cursor));

  return <span className={className}>{parts}</span>;
}
