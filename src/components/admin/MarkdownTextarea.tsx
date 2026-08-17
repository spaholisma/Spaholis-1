import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Link2, Bold, Italic } from "lucide-react";

/**
 * A plain Textarea plus a tiny toolbar to insert Markdown that RichText renders
 * on the site: named links [text](url), **bold**, *italic*. "Link" wraps the
 * current selection as the link label and asks for the URL.
 */
export function MarkdownTextarea({
  value,
  onChange,
  className,
  placeholder,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (make: (sel: string) => { text: string; caretOffsetFromEnd?: number }) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const sel = value.slice(start, end);
    const { text, caretOffsetFromEnd = 0 } = make(sel);
    if (text == null) return; // cancelled
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const pos = start + text.length - caretOffsetFromEnd;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertLink = () =>
    apply((sel) => {
      const label = sel || "link text";
      const url = window.prompt("Link URL (https://…)", "https://");
      if (url == null) return { text: null as any };
      return { text: `[${label}](${url.trim() || "https://"})` };
    });

  const btn = "inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background hover:bg-muted text-xs font-body transition-colors";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <button type="button" className={btn} title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>
          <Link2 className="h-3.5 w-3.5" /> Link
        </button>
        <button type="button" className={btn} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => apply((s) => ({ text: `**${s || "bold"}**`, caretOffsetFromEnd: s ? 0 : 2 }))}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => apply((s) => ({ text: `*${s || "italic"}*`, caretOffsetFromEnd: s ? 0 : 1 }))}>
          <Italic className="h-3.5 w-3.5" />
        </button>
      </div>
      <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={className} placeholder={placeholder} rows={rows} />
    </div>
  );
}
