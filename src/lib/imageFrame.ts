import type { CSSProperties } from "react";

/**
 * How a photo sits in its frame: which point of it stays in view, and how
 * close it is. Set in Admin → Classes → Edit → Featured Image ("Adjust").
 *
 * Kept in the image's own address, after a "#": …/photo.png#frame=50,30,1.25
 * (x %, y %, zoom). The browser never sends that part to the server, so the
 * photo loads exactly as before — and every place that shows the picture gets
 * the framing with it, with nothing else to save.
 */
export interface ImageFrame {
  /** 0 = left edge, 100 = right edge. */
  x: number;
  /** 0 = top edge, 100 = bottom edge. */
  y: number;
  /** 1 = the whole frame filled as it was; up to MAX_ZOOM closer. */
  zoom: number;
}

export const DEFAULT_FRAME: ImageFrame = { x: 50, y: 50, zoom: 1 };
export const MAX_ZOOM = 3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, step: number) => Math.round(n / step) * step;

/** The address without the framing, and the framing itself. */
export function parseFrame(url: string | null | undefined): { src: string; frame: ImageFrame } {
  const raw = String(url ?? "");
  const at = raw.indexOf("#frame=");
  if (at < 0) return { src: raw, frame: DEFAULT_FRAME };
  const [x, y, zoom] = raw.slice(at + 7).split(",").map(Number);
  return {
    src: raw.slice(0, at),
    frame: {
      x: Number.isFinite(x) ? clamp(x, 0, 100) : 50,
      y: Number.isFinite(y) ? clamp(y, 0, 100) : 50,
      zoom: Number.isFinite(zoom) ? clamp(zoom, 1, MAX_ZOOM) : 1,
    },
  };
}

export const isDefaultFrame = (f: ImageFrame) => f.x === 50 && f.y === 50 && f.zoom === 1;

/** The address with this framing (none when centred and not zoomed). */
export function withFrame(url: string | null | undefined, frame: ImageFrame): string {
  const { src } = parseFrame(url);
  if (!src) return src;
  const f = {
    x: round(clamp(frame.x, 0, 100), 0.5),
    y: round(clamp(frame.y, 0, 100), 0.5),
    zoom: round(clamp(frame.zoom, 1, MAX_ZOOM), 0.05),
  };
  return isDefaultFrame(f) ? src : `${src}#frame=${f.x},${f.y},${Number(f.zoom.toFixed(2))}`;
}

/**
 * The style for an <img> with object-fit: cover. The zoom grows the picture
 * around the chosen point, so that point stays put; the box around it must
 * clip (overflow: hidden), which every card and hero here already does.
 */
export function frameStyle(frame: ImageFrame): CSSProperties {
  if (isDefaultFrame(frame)) return {};
  return {
    objectPosition: `${frame.x}% ${frame.y}%`,
    ...(frame.zoom > 1 ? { transform: `scale(${frame.zoom})`, transformOrigin: `${frame.x}% ${frame.y}%` } : {}),
  };
}

/** src + style for an image address that may carry a framing. */
export function framed(url: string | null | undefined): { src: string; style: CSSProperties } {
  const { src, frame } = parseFrame(url);
  return { src, style: frameStyle(frame) };
}
