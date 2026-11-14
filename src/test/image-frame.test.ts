import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_FRAME, MAX_ZOOM, frameStyle, framed, parseFrame, withFrame } from "@/lib/imageFrame";

// 2026-11: a class photo can be moved (up, down, left, right) and zoomed in
// its frame, in Admin → Classes → Edit → Featured Image. The framing travels in
// the image address after "#frame=", so nothing else needs saving and the
// photo itself loads as before.

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");
const URL = "https://x.supabase.co/storage/v1/object/public/class-images/1794675435587.png";

describe("the framing in the image address", () => {
  it("a photo without framing is centred and not zoomed", () => {
    expect(parseFrame(URL)).toEqual({ src: URL, frame: DEFAULT_FRAME });
    expect(framed(URL)).toEqual({ src: URL, style: {} });
    expect(parseFrame(null).src).toBe("");
  });

  it("writes and reads x, y and zoom", () => {
    const u = withFrame(URL, { x: 30, y: 20, zoom: 1.5 });
    expect(u).toBe(`${URL}#frame=30,20,1.5`);
    expect(parseFrame(u)).toEqual({ src: URL, frame: { x: 30, y: 20, zoom: 1.5 } });
  });

  it("replaces an older framing, and drops it when back to the centre", () => {
    const u = withFrame(`${URL}#frame=10,10,2`, { x: 70, y: 60, zoom: 1 });
    expect(u).toBe(`${URL}#frame=70,60,1`);
    expect(withFrame(u, DEFAULT_FRAME)).toBe(URL);
  });

  it("keeps the values inside their limits", () => {
    expect(parseFrame(`${URL}#frame=-20,140,9`).frame).toEqual({ x: 0, y: 100, zoom: MAX_ZOOM });
    expect(parseFrame(`${URL}#frame=a,b,c`).frame).toEqual(DEFAULT_FRAME);
  });

  it("moves the visible part and zooms around the chosen point", () => {
    expect(frameStyle({ x: 30, y: 20, zoom: 1 })).toEqual({ objectPosition: "30% 20%" });
    expect(frameStyle({ x: 30, y: 20, zoom: 1.5 })).toEqual({
      objectPosition: "30% 20%", transform: "scale(1.5)", transformOrigin: "30% 20%",
    });
  });
});

describe("where the framing is set and used", () => {
  it("the Edit Event form has the framing editor", () => {
    const form = read("src/components/admin/AdminEventsManager.tsx");
    expect(form).toMatch(/<ImageFrameEditor url=\{editing\.image_url\} onChange=\{\(url\) => setEditing\(\{ \.\.\.editing, image_url: url \}\)\} \/>/);
    const editor = read("src/components/admin/ImageFrameEditor.tsx");
    expect(editor).toMatch(/onPointerMove=\{onPointerMove\}/);
    expect(editor).toMatch(/type="range" min=\{1\} max=\{MAX_ZOOM\}/);
  });

  it("every page that shows a class photo follows it", () => {
    for (const f of [
      "src/components/EventCard.tsx", "src/components/FeaturedWorkshop.tsx", "src/pages/ClassBooking.tsx",
      "src/pages/ClassDetail.tsx", "src/pages/TeacherProfile.tsx", "src/components/TeacherPortfolios.tsx",
      "src/components/InstructorPortfolios.tsx", "src/components/WellnessSection.tsx",
    ]) {
      expect(read(f), f).toMatch(/\{\.\.\.framed\(/);
    }
  });
});
