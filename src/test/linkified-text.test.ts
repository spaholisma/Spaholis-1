/**
 * Link detection for pasted notes.
 *
 * Notes are free text an admin pastes into, and they're rendered as anchors —
 * so the parser decides what becomes a clickable link. Two things matter:
 * only http(s)/www ever becomes a link (never `javascript:`), and the URL is
 * cut where the URL actually ends, not where the sentence does.
 */
import { describe, it, expect } from "vitest";
import { extractLinks } from "@/components/admin/LinkifiedText";

describe("extractLinks", () => {
  it("finds a plain https link", () => {
    expect(extractLinks("See https://docs.google.com/doc/abc123")).toEqual([
      "https://docs.google.com/doc/abc123",
    ]);
  });

  it("makes a bare www link absolute", () => {
    expect(extractLinks("www.spaholis.com/classes")).toEqual([
      "https://www.spaholis.com/classes",
    ]);
  });

  it("keeps query strings and anchors intact", () => {
    expect(extractLinks("https://a.com/x?y=1&z=2#top")).toEqual(["https://a.com/x?y=1&z=2#top"]);
  });

  it("leaves trailing sentence punctuation out of the link", () => {
    expect(extractLinks("Ver la nota en https://example.com/nota.")).toEqual([
      "https://example.com/nota",
    ]);
    expect(extractLinks("(https://example.com/a)")).toEqual(["https://example.com/a"]);
  });

  it("finds several links and de-duplicates", () => {
    expect(
      extractLinks("https://a.com/1 y https://b.com/2 y otra vez https://a.com/1"),
    ).toEqual(["https://a.com/1", "https://b.com/2"]);
  });

  it("never turns a javascript: URL into a link", () => {
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
});
