import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-11-22: events (e.g. Wellness Sunday) can have a video. The card keeps
// its photo and gets a "Watch video" button that opens the video with sound.

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("event video", () => {
  it("is kept in site_content class_videos, no new column", () => {
    const lib = read("src/lib/classVideos.ts");
    expect(lib).toContain('export const CLASS_VIDEOS_KEY = "class_videos";');
    expect(lib).toContain("content: { videos } as any");
  });

  it("both event cards show Watch video next to RSVP / Request", () => {
    const card = read("src/components/EventCard.tsx");
    expect(card.match(/<WatchVideoButton classId=\{cls\.id\} title=\{cls\.title\} \/>/g)?.length).toBe(2);
    expect(card).toContain("{open && (");
    const en = JSON.parse(read("src/i18n/locales/en.json"));
    const es = JSON.parse(read("src/i18n/locales/es.json"));
    expect(en.classes.watchVideo).toBe("Watch video");
    expect(es.classes.watchVideo).toBe("Ver video");
  });

  it("admins upload it in Edit Event and it is saved with the event", () => {
    const admin = read("src/components/admin/AdminEventsManager.tsx");
    expect(admin).toContain("Event video (optional)");
    expect(admin).toContain("const path = `videos/${Date.now()}.${ext}`;");
    expect(admin).toContain("await setClassVideo(savedId, videoUrl.trim() || null);");
    expect(admin).toContain('setVideoUrl(videoMap[c.id] || "");');
  });
});
