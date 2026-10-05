/**
 * Turns a plain-text description into blocks a page can lay out nicely.
 *
 * Descriptions are written in the admin as plain text with blank lines between
 * parts. A part whose first line starts with an emoji ("⛵ Private Boat Tour")
 * is a highlight with its own text; a line in capitals joined by "•" is a
 * tagline; a last line joined by "·" is a set of short facts. Anything else is
 * an ordinary paragraph, so older descriptions read exactly as before.
 */
export type DescriptionBlock =
  | { kind: "lead"; text: string }
  | { kind: "para"; text: string }
  | { kind: "feature"; icon: string; title: string; text: string }
  | { kind: "tagline"; words: string[] }
  | { kind: "facts"; items: string[] };

const PICTO = /\p{Extended_Pictographic}/u;

/** "⛵ Private Boat Tour" → { icon: "⛵", title: "Private Boat Tour" } */
function splitIcon(line: string): { icon: string; title: string } | null {
  const m = line.match(/^(\S+)\s+(.+)$/u);
  if (!m || !PICTO.test(m[1]) || /[A-Za-zÀ-ÿ0-9]/.test(m[1])) return null;
  return { icon: m[1], title: m[2].trim() };
}

const isTagline = (line: string) =>
  line.includes("•") && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line);

export function descriptionBlocks(text: string | null | undefined): DescriptionBlock[] {
  const parts = (text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part, i): DescriptionBlock => {
    const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
    const head = splitIcon(lines[0]);
    if (head && lines.length > 1) {
      return { kind: "feature", icon: head.icon, title: head.title, text: lines.slice(1).join(" ") };
    }
    if (lines.length === 1 && isTagline(lines[0])) {
      return { kind: "tagline", words: lines[0].split("•").map((w) => w.trim()).filter(Boolean) };
    }
    if (i === parts.length - 1 && i > 0 && lines.length === 1 && lines[0].includes(" · ")) {
      return { kind: "facts", items: lines[0].split(" · ").map((w) => w.trim()).filter(Boolean) };
    }
    if (i === 0 && lines.length === 1 && parts.length > 1) return { kind: "lead", text: lines[0] };
    return { kind: "para", text: lines.join("\n") };
  });
}

/** True when the description has the structured parts (highlights etc.). */
export const isStructured = (blocks: DescriptionBlock[]) =>
  blocks.some((b) => b.kind === "feature" || b.kind === "tagline");
