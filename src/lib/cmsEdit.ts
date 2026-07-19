// Shared helpers for the "edit on page" preview mode.
//
// The admin Content editor can open the live-preview iframe with `?__edit=1`.
// Inside the iframe, editable elements (tagged with data-cms-path) become
// click-to-edit; clicks are relayed to the admin via postMessage, and the admin
// pushes back staged content overrides so the preview updates live.

export interface CmsEditMessage {
  source: "cms";
  type: "edit";
  path: string;
  kind: string;
}
export interface CmsReadyMessage {
  source: "cms";
  type: "ready";
}
export interface CmsOverridesMessage {
  source: "cms";
  type: "set-overrides";
  overrides: unknown;
}
export type CmsMessage = CmsEditMessage | CmsReadyMessage | CmsOverridesMessage;

// Cached once per document load. SPA navigations don't reload, so the module
// value persists; a real reload re-reads the URL (the admin keeps __edit in the
// iframe src, so reloads stay in edit mode).
let cached: boolean | null = null;

export function isCmsEditMode(): boolean {
  if (typeof window === "undefined") return false;
  if (cached !== null) return cached;
  try {
    cached = new URLSearchParams(window.location.search).has("__edit");
  } catch {
    cached = false;
  }
  return cached;
}
