/**
 * Link parsing for pasted notes.
 *
 * Notes are free text an admin pastes into, and they're rendered as anchors —
 * so this parser decides what becomes a clickable link. Three things matter:
 * only http(s)/www ever becomes a link (never `javascript:`), the URL is cut
 * where the URL ends rather than where the sentence does, and naming a link
 * rewrites the note without the admin ever typing markdown.
 */
import { describe, it, expect } from "vitest";
import {
  extractLinks,
  renameLinkInText,
  prettyUrl,
  normalizeLinkInput,
  sanitizeLinkLabel,
} from "@/components/admin/LinkifiedText";

const hrefs = (text: string) => extractLinks(text).map((l) => l.href);
const labels = (text: string) => extractLinks(text).map((l) => l.label);

describe("extractLinks", () => {
  it("finds a plain https link and shows the URL when unnamed", () => {
    const links = extractLinks("See https://docs.google.com/doc/abc123");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("https://docs.google.com/doc/abc123");
    expect(links[0].label).toBe("https://docs.google.com/doc/abc123");
    expect(links[0].named).toBe(false);
  });

  it("makes a bare www link absolute", () => {
    expect(hrefs("www.spaholis.com/classes")).toEqual(["https://www.spaholis.com/classes"]);
  });

  it("keeps query strings and anchors intact", () => {
    expect(hrefs("https://a.com/x?y=1&z=2#top")).toEqual(["https://a.com/x?y=1&z=2#top"]);
  });

  it("leaves trailing sentence punctuation out of the link", () => {
    expect(hrefs("Ver la nota en https://example.com/nota.")).toEqual(["https://example.com/nota"]);
    expect(hrefs("(https://example.com/a)")).toEqual(["https://example.com/a"]);
  });

  it("finds several links and de-duplicates by destination", () => {
    expect(hrefs("https://a.com/1 y https://b.com/2 y otra vez https://a.com/1")).toEqual([
      "https://a.com/1",
      "https://b.com/2",
    ]);
  });

  it("never turns a javascript: or data: URL into a link", () => {
    // eslint-disable-next-line no-script-url
    expect(extractLinks("javascript:alert(1)")).toEqual([]);
    expect(extractLinks("data:text/html,<script>alert(1)</script>")).toEqual([]);
    expect(extractLinks("file:///etc/passwd")).toEqual([]);
  });

  it("ignores plain text and empty notes", () => {
    expect(extractLinks("Cliente prefiere terapeuta femenina")).toEqual([]);
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
  });

  it("reads a named link's name, not its URL", () => {
    const links = extractLinks("Ficha: [Ficha del cliente](https://docs.google.com/d/1)");
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Ficha del cliente");
    expect(links[0].href).toBe("https://docs.google.com/d/1");
    expect(links[0].named).toBe(true);
  });

  it("names a www link and still makes it absolute", () => {
    const links = extractLinks("[Clases](www.spaholis.com/classes)");
    expect(links[0].label).toBe("Clases");
    expect(links[0].href).toBe("https://www.spaholis.com/classes");
  });

  it("handles named and bare links side by side", () => {
    expect(labels("[Ficha](https://a.com/1) y https://b.com/2")).toEqual(["Ficha", "https://b.com/2"]);
  });

  it("does not treat a bracketed javascript: URL as a named link", () => {
    // eslint-disable-next-line no-script-url
    expect(extractLinks("[Click me](javascript:alert(1))")).toEqual([]);
  });
});

describe("normalizeLinkInput", () => {
  it("accepts a full https URL as-is", () => {
    expect(normalizeLinkInput("https://docs.google.com/d/1")).toBe("https://docs.google.com/d/1");
  });

  it("adds https:// to a bare host", () => {
    expect(normalizeLinkInput("docs.google.com/d/1")).toBe("https://docs.google.com/d/1");
    expect(normalizeLinkInput("www.spaholis.com")).toBe("https://www.spaholis.com");
  });

  it("keeps http:// (not everything is https)", () => {
    expect(normalizeLinkInput("http://intranet.local.test/x")).toBe("http://intranet.local.test/x");
  });

  it("rejects a javascript: address instead of coercing it", () => {
    // The whole point of the insert button's guard: a dangerous scheme must be
    // refused, not turned into https://javascript:...
    // eslint-disable-next-line no-script-url
    expect(normalizeLinkInput("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkInput("data:text/html,<script>")).toBeNull();
    expect(normalizeLinkInput("mailto:someone@x.com")).toBeNull();
    expect(normalizeLinkInput("file:///etc/passwd")).toBeNull();
  });

  it("rejects blanks, typos and hosts with no dot", () => {
    expect(normalizeLinkInput("")).toBeNull();
    expect(normalizeLinkInput("   ")).toBeNull();
    expect(normalizeLinkInput(null)).toBeNull();
    expect(normalizeLinkInput("just some words")).toBeNull();
    expect(normalizeLinkInput("localhost")).toBeNull();
  });

  it("round-trips: what it returns is what the renderer would link", () => {
    const href = normalizeLinkInput("docs.google.com/spreadsheets/d/1")!;
    expect(extractLinks(href)).toHaveLength(1);
    expect(extractLinks(href)[0].href).toBe(href);
  });
});

describe("sanitizeLinkLabel", () => {
  it("strips brackets that would break the [text](url) form", () => {
    expect(sanitizeLinkLabel("Ficha [importante]")).toBe("Ficha importante");
    expect(sanitizeLinkLabel("  Planilla  ")).toBe("Planilla");
    expect(sanitizeLinkLabel("line\nbreak")).toBe("linebreak");
  });
});

describe("prettyUrl", () => {
  it("shortens a real Google Sheets link to something readable", () => {
    const href =
      "https://docs.google.com/spreadsheets/d/1bzuMi4zAqVbTcg0FkQFfiY-AZaaTT59JKxO1tOmUfJM/edit?gid=1938098551#gid=1938098551";
    const short = prettyUrl(href);
    expect(short.startsWith("docs.google.com/")).toBe(true);
    expect(short.endsWith("…")).toBe(true);
    // The whole point: far shorter than the 118-character original.
    expect(short.length).toBeLessThan(45);
    expect(href.length).toBeGreaterThan(100);
  });

  it("drops the scheme and www", () => {
    expect(prettyUrl("https://www.spaholis.com")).toBe("spaholis.com");
    expect(prettyUrl("https://spaholis.com/")).toBe("spaholis.com");
  });

  it("keeps a short path as-is", () => {
    expect(prettyUrl("https://spaholis.com/classes")).toBe("spaholis.com/classes");
  });

  it("falls back to the raw string when it isn't parseable", () => {
    expect(prettyUrl("not a url")).toBe("not a url");
  });
});

describe("renameLinkInText", () => {
  const linkIn = (text: string) => extractLinks(text)[0];

  it("names a bare URL", () => {
    const text = "Ver https://docs.google.com/d/1 antes de la cita";
    expect(renameLinkInText(text, linkIn(text), "Ficha del cliente")).toBe(
      "Ver [Ficha del cliente](https://docs.google.com/d/1) antes de la cita",
    );
  });

  it("renames an already-named link", () => {
    const text = "[Vieja](https://a.com/1)";
    expect(renameLinkInText(text, linkIn(text), "Nueva")).toBe("[Nueva](https://a.com/1)");
  });

  it("clearing the name reverts to the bare URL", () => {
    const text = "Ficha: [Ficha](https://a.com/1)";
    expect(renameLinkInText(text, linkIn(text), "  ")).toBe("Ficha: https://a.com/1");
  });

  it("leaves other links alone", () => {
    const text = "https://a.com/1 y https://b.com/2";
    const first = extractLinks(text)[0];
    expect(renameLinkInText(text, first, "Uno")).toBe("[Uno](https://a.com/1) y https://b.com/2");
  });

  it("survives URLs containing regex characters", () => {
    // A query string is full of characters that would otherwise be a pattern.
    const text = "https://a.com/x?y=1&z=(2)+3";
    const renamed = renameLinkInText(text, linkIn(text), "Reporte");
    expect(renamed).toBe("[Reporte](https://a.com/x?y=1&z=(2)+3)");
    expect(extractLinks(renamed)[0].label).toBe("Reporte");
  });

  it("naming a bare URL leaves the note otherwise untouched", () => {
    const text = "Nota importante www.spaholis.com fin";
    expect(renameLinkInText(text, linkIn(text), "Sitio")).toBe(
      "Nota importante [Sitio](www.spaholis.com) fin",
    );
  });
});
