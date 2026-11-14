import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_FRAME, MAX_ZOOM, frameStyle, isDefaultFrame, parseFrame, withFrame, type ImageFrame } from "@/lib/imageFrame";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const STEP = 5;

/**
 * Move and zoom a photo inside its frame: drag it, or use the arrows and the
 * zoom; the previews show it as the website's cards and the class page show
 * it. The result is written back into the image address (see imageFrame.ts).
 */
export function ImageFrameEditor({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const { src, frame } = parseFrame(url);
  const drag = useRef<{ x: number; y: number; frame: ImageFrame; w: number; h: number } | null>(null);
  const set = (f: Partial<ImageFrame>) => onChange(withFrame(src, { ...frame, ...f }));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, frame, w: box.width, h: box.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Dragging the picture right shows more of its left side, and so on.
    const k = 100 / Math.max(1, d.frame.zoom);
    onChange(withFrame(src, {
      ...d.frame,
      x: clamp(d.frame.x - ((e.clientX - d.x) / d.w) * k, 0, 100),
      y: clamp(d.frame.y - ((e.clientY - d.y) / d.h) * k, 0, 100),
    }));
  };
  const end = () => { drag.current = null; };

  const style = { ...frameStyle(frame), objectFit: "cover" as const };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start gap-3">
        {/* The one to drag: wide, like the class page and the featured banner. */}
        <div className="space-y-1">
          <div
            className="relative aspect-[16/9] w-72 max-w-full cursor-grab touch-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            role="application"
            aria-label="Drag the photo to move it inside its frame"
          >
            <img src={src} alt="" draggable={false} className="h-full w-full select-none" style={style} />
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium">
              <Move className="h-3 w-3" /> Drag to move
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">Class page &amp; banner</p>
        </div>
        {/* How it looks on a class card. */}
        <div className="space-y-1">
          <div className="aspect-[4/3] w-36 overflow-hidden rounded-lg bg-muted">
            <img src={src} alt="" draggable={false} className="h-full w-full" style={style} />
          </div>
          <p className="text-[11px] text-muted-foreground">Card</p>
        </div>
        <div className="space-y-1">
          <div className="aspect-square w-24 overflow-hidden rounded-lg bg-muted">
            <img src={src} alt="" draggable={false} className="h-full w-full" style={style} />
          </div>
          <p className="text-[11px] text-muted-foreground">Square</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" aria-label="Move the photo">
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" title="Show more of the top"
            onClick={() => set({ y: clamp(frame.y - STEP, 0, 100) })}><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" title="Show more of the bottom"
            onClick={() => set({ y: clamp(frame.y + STEP, 0, 100) })}><ArrowDown className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" title="Show more of the left"
            onClick={() => set({ x: clamp(frame.x - STEP, 0, 100) })}><ArrowLeft className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" title="Show more of the right"
            onClick={() => set({ x: clamp(frame.x + STEP, 0, 100) })}><ArrowRight className="h-4 w-4" /></Button>
        </div>
        <label className="flex min-w-[200px] flex-1 items-center gap-2 text-xs">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.05} value={frame.zoom}
            onChange={(e) => set({ zoom: Number(e.target.value) })}
            className="flex-1 accent-[hsl(var(--primary))]"
            aria-label="Zoom"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="w-10 text-right tabular-nums">{Math.round(frame.zoom * 100)}%</span>
        </label>
        <Button type="button" size="sm" variant="ghost" disabled={isDefaultFrame(frame)}
          onClick={() => onChange(withFrame(src, DEFAULT_FRAME))}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The framing is saved with the class. Every place on the website that shows this photo uses it.
      </p>
    </div>
  );
}
