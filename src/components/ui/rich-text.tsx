import { createElement, Fragment, type ReactNode } from "react";
import { isCmsEditMode } from "@/lib/cmsEdit";

/**
 * RichText — renders a small, safe subset of Markdown for editable site copy:
 *
 *   [label](https://url)   → link  (external opens in a new tab)
 *   **bold**               → <strong>
 *   *italic*               → <em>
 *   line breaks (\n)       → <br/>
 *
 * It builds React elements (never dangerouslySetInnerHTML), so admin-entered
 * content can never inject scripts/markup. Plain text with no markdown renders
 * exactly as before, so wrapping an existing field is always safe.
 */

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /\*(?!\s)([^*]+?)\*/g;

type Transform = (text: string, key: string) => ReactNode[];

// Run a regex over `text`, turning each match into a node via `render` and
// recursing into the gaps with `next` (the remaining transform pipeline).
function applyRule(
  text: string,
  regex: RegExp,
  render: (m: RegExpExecArray, key: string) => ReactNode,
  next: Transform,
  keyBase: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(...next(text.slice(last, m.index), `${keyBase}-t${i}`));
    out.push(render(m, `${keyBase}-m${i}`));
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(...next(text.slice(last), `${keyBase}-t${i}`));
  return out;
}

function isExternal(url: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

// Innermost transform: split remaining plain text on newlines into <br/>.
function renderText(text: string, key: string): ReactNode[] {
  const parts = text.split("\n");
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) nodes.push(createElement("br", { key: `${key}-br${i}` }));
    if (part) nodes.push(part);
  });
  return nodes;
}

function renderItalic(text: string, key: string): ReactNode[] {
  return applyRule(
    text,
    ITALIC_RE,
    (m, k) => createElement("em", { key: k }, ...renderText(m[1], k)),
    renderText,
    key,
  );
}

function renderBold(text: string, key: string): ReactNode[] {
  return applyRule(
    text,
    BOLD_RE,
    (m, k) => createElement("strong", { key: k }, ...renderItalic(m[1], k)),
    renderItalic,
    key,
  );
}

function renderLinks(text: string, key: string): ReactNode[] {
  return applyRule(
    text,
    LINK_RE,
    (m, k) => {
      const [, label, url] = m;
      const external = isExternal(url);
      return createElement(
        "a",
        {
          key: k,
          href: url,
          className: "underline underline-offset-2 hover:opacity-80 transition-opacity",
          ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        },
        ...renderBold(label, k),
      );
    },
    renderBold,
    key,
  );
}

export function parseRichText(value: string): ReactNode[] {
  return renderLinks(String(value ?? ""), "rt");
}

interface RichTextProps {
  value: string | null | undefined;
  /** Wrapper element. Defaults to a <span> so it can live inline in a <p>. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  /**
   * Dot-path into the site content (e.g. "footer.description"). When set and the
   * page is in preview edit mode, the element becomes click-to-edit.
   */
  path?: string;
}

export function RichText({ value, as = "span", className, path }: RichTextProps) {
  const editable = !!path && isCmsEditMode();
  const editAttrs = editable ? { "data-cms-path": path, "data-cms-kind": "text" } : {};

  if (value == null || value === "") {
    // In edit mode, still render a clickable placeholder so empty copy can be
    // filled in from the page.
    if (editable) return createElement(as, { className, ...editAttrs }, "(empty — click to edit)");
    return null;
  }
  const nodes = parseRichText(String(value));
  return createElement(as, { className, ...editAttrs }, createElement(Fragment, null, ...nodes));
}
