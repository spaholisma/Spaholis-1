import { useEffect } from "react";

/** The build the page is running: /assets/index-<hash>.js, or null (dev server). */
export function currentBuild(doc: Document = document): string | null {
  for (const s of Array.from(doc.scripts)) {
    const m = s.src.match(/\/assets\/(index-[\w-]+\.js)$/);
    if (m) return m[1];
  }
  return null;
}

/** The build named in a freshly fetched index.html. */
export function buildIn(html: string): string | null {
  return html.match(/\/assets\/(index-[\w-]+\.js)/)?.[1] ?? null;
}

/** Someone is in the middle of something: a dialog is open or they are typing. */
export function busy(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  const el = doc.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
}

/**
 * The Admin stays open all day, so a tab can keep running code from before a
 * new version was published — and miss what that version fixed. Every few
 * minutes (and on coming back to the tab) this asks the server which version
 * is current, and reloads the page onto it — but never while a dialog is open
 * or someone is typing; then it waits for the next check.
 */
export function useNewVersionReload(everyMs = 3 * 60_000) {
  useEffect(() => {
    const running = currentBuild();
    if (!running) return; // dev server: nothing to compare
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
        const latest = buildIn(await res.text());
        if (latest && latest !== running && !busy()) window.location.reload();
      } catch { /* offline for a moment: try again later */ }
    };
    const id = window.setInterval(check, everyMs);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [everyMs]);
}
