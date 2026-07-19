import { useEffect } from "react";
import { isCmsEditMode } from "@/lib/cmsEdit";
import { setPreviewOverrides } from "@/hooks/useSiteContent";

/**
 * Mounted app-wide. Does nothing unless the page is loaded inside the admin
 * live-preview with `?__edit=1`. In that mode it:
 *   • highlights every editable element (data-cms-path) on hover,
 *   • relays a click on one to the admin (postMessage → { type: "edit", path }),
 *   • applies content overrides pushed back from the admin so the preview
 *     updates live without a reload.
 */
export function PreviewEditBridge() {
  useEffect(() => {
    if (!isCmsEditMode()) return;

    const style = document.createElement("style");
    style.setAttribute("data-cms-style", "");
    style.textContent = `
      [data-cms-path]{ outline:1px dashed transparent; outline-offset:2px; cursor:pointer;
        transition:outline-color .15s ease, background-color .15s ease; border-radius:2px; }
      [data-cms-path]:hover{ outline-color:#1d5b6a; background-color:rgba(29,91,106,.08); }
      .cms-edit-banner{ position:fixed; z-index:2147483647; bottom:14px; left:50%;
        transform:translateX(-50%); background:#1d5b6a; color:#fff;
        font:600 12px/1.2 Arial,Helvetica,sans-serif; padding:9px 16px; border-radius:9999px;
        box-shadow:0 6px 18px rgba(0,0,0,.22); pointer-events:none; white-space:nowrap; }
    `;
    document.head.appendChild(style);

    const banner = document.createElement("div");
    banner.className = "cms-edit-banner";
    banner.textContent = "Edit mode — click any highlighted text to edit";
    document.body.appendChild(banner);

    // Capture-phase so we intercept before links/buttons act on the click.
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.("[data-cms-path]") as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent?.postMessage(
        { source: "cms", type: "edit", path: el.getAttribute("data-cms-path"), kind: el.getAttribute("data-cms-kind") || "text" },
        "*",
      );
    };
    document.addEventListener("click", onClick, true);

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "cms") return;
      if (d.type === "set-overrides") setPreviewOverrides(d.overrides ?? null);
    };
    window.addEventListener("message", onMessage);

    // Tell the admin we're ready so it pushes the current staged overrides.
    window.parent?.postMessage({ source: "cms", type: "ready" }, "*");

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("message", onMessage);
      style.remove();
      banner.remove();
    };
  }, []);

  return null;
}
