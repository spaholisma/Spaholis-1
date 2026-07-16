import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Notes are plain text, so a named link is stored as `[Name](url)` — the
 * markdown convention. Bare URLs still link on their own; the name is optional.
 *
 * Only http(s) and bare www are ever recognised. Anything else — most
 * importantly `javascript:` — stays inert text, so pasted content can't turn
 * into a scripted link.
 */
const NAMED = String.raw`\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|www\.[^\s)]+)\)`;
const BARE = String.raw`(https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)`;
const TOKEN_RE = new RegExp(`${NAMED}|${BARE}`, "gi");

/** Trailing sentence punctuation belongs to the sentence, not the URL. */
const trimTrailing = (url: string): string => url.replace(/[.,;:!?)\]}>'"]+$/, "");

const toHref = (url: string): string =>
  url.toLowerCase().startsWith("www.") ? `https://${url}` : url;

export interface ParsedLink {
  /** Absolute URL for the anchor. */
  href: string;
  /** What to show — the given name, or the URL when it has none. */
  label: string;
  /** Exactly as written in the note, so it can be rewritten in place. */
  raw: string;
  /** Whether it already carries a `[Name](...)`. */
  named: boolean;
}

interface Token extends ParsedLink {
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (m[1] && m[2]) {
      out.push({
        href: toHref(m[2]),
        label: m[1],
        raw: m[2],
        named: true,
        start,
        end: start + m[0].length,
      });
    } else if (m[3]) {
      const url = trimTrailing(m[3]);
      if (!url) continue;
      out.push({
        href: toHref(url),
        label: url,
        raw: url,
        named: false,
        start,
        end: start + url.length,
      });
    }
  }
  return out;
}

/** The links in a note, de-duplicated by destination. */
export function extractLinks(text: string | null | undefined): ParsedLink[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: ParsedLink[] = [];
  for (const t of tokenize(text)) {
    if (seen.has(t.href)) continue;
    seen.add(t.href);
    out.push({ href: t.href, label: t.label, raw: t.raw, named: t.named });
  }
  return out;
}

/**
 * A readable stand-in for a long URL: drop the scheme and `www.`, and clip the
 * path. A Google Sheets link is ~90 characters of ids and query strings that
 * tell a person nothing — the host plus the start of the path does.
 */
export function prettyUrl(href: string, maxPath = 24): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, "");
    const path = `${u.pathname}${u.search}${u.hash}`.replace(/\/$/, "");
    if (!path || path === "/") return host;
    return host + (path.length > maxPath ? `${path.slice(0, maxPath)}…` : path);
  } catch {
    return href;
  }
}

/**
 * Turn what someone typed into the link box into a URL safe to insert, or null
 * if it isn't one. Bare hosts get https:// so "docs.google.com/x" works, but a
 * scheme we don't allow is rejected outright rather than guessed at — the
 * insert path must not become a way around the renderer's allowlist.
 */
export function normalizeLinkInput(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Has an explicit scheme that isn't http(s)? Refuse — never coerce it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // A hostname with no dot is a typo, not a site.
    if (!u.hostname.includes(".")) return null;
    if (/\s/.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

/** A link's display text lives inside `[...]`, so it can't contain brackets. */
export function sanitizeLinkLabel(label: string): string {
  return label.replace(/[[\]\n]/g, "").trim();
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Give a link a name (or clear it back to a bare URL) by rewriting the note
 * text — so the admin never has to type markdown themselves.
 */
export function renameLinkInText(text: string, link: ParsedLink, newLabel: string): string {
  const label = newLabel.trim();
  const raw = escapeRe(link.raw);
  if (link.named) {
    const re = new RegExp(String.raw`\[[^\]\n]*\]\(${raw}\)`);
    return text.replace(re, label ? `[${label}](${link.raw})` : link.raw);
  }
  if (!label) return text;
  return text.replace(new RegExp(raw), `[${label}](${link.raw})`);
}

/** Render a note with its links clickable, showing each link's name. */
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

  for (const t of tokenize(text)) {
    if (t.start > cursor) parts.push(text.slice(cursor, t.start));
    parts.push(
      <a
        key={`${t.start}-${t.href}`}
        href={t.href}
        target="_blank"
        rel="noopener noreferrer"
        // The note often sits inside a clickable row; opening the link
        // shouldn't also open the entry.
        onClick={(e) => e.stopPropagation()}
        className={cn("underline underline-offset-2 hover:opacity-70 break-words", linkClassName)}
        title={t.href}
      >
        {/* An unnamed link shows a readable short form; the full URL is on hover. */}
        {t.named ? t.label : prettyUrl(t.href)}
      </a>,
    );
    cursor = t.end;
  }
  parts.push(text.slice(cursor));

  return <span className={className}>{parts}</span>;
}
