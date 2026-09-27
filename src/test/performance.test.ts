import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { responsiveImage, sizedImage } from "@/lib/sizedImage";

// The site used to ship as one 3 MB script (the whole Admin Panel included) and
// some photos were several MB, so phones felt slow to open and to answer taps.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("pages load when they are opened", () => {
  const app = read("src/App.tsx");

  it("only the home page, the 404 and the QR links are in the first download", () => {
    const eager = [...app.matchAll(/^import (\w+) from "\.\/pages\/\w+";$/gm)].map((m) => m[1]).sort();
    expect(eager).toEqual(["Index", "NotFound", "PartnerRedirect"]);
    expect(app).toMatch(/AdminDashboard: \(\) => import\("\.\/pages\/AdminDashboard"\)/);
    expect(app).toMatch(/const AdminDashboard = lazy\(pages\.AdminDashboard\);/);
    expect(app).toMatch(/<Suspense fallback=\{<PageFallback \/>\}>\s*<Routes>/);
  });

  it("fetches the public pages in the background once idle — never the Admin or account pages", () => {
    expect(app).toMatch(/<PrefetchPages \/>/);
    const excluded = app.match(/\(k\) => !\[([^\]]*)\]\.includes\(k\)/)![1];
    for (const page of ["AdminDashboard", "ClientDashboard", "CardAuthorizationArchive", "TestPayment", "TestPaymentReturn"]) {
      expect(excluded).toContain(`"${page}"`);
    }
    expect(excluded).not.toContain('"Booking"');
  });

  it("phones set to Reduce motion get no slide/fade effects", () => {
    expect(app).toMatch(/<MotionConfig reducedMotion="user">/);
  });
});

describe("photos at the size they are shown", () => {
  const hero =
    "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/fb8bcca7-04cb-4a14-9558-ff7f38846bce/Untitled+design.png";

  it("asks Squarespace for a width instead of the original", () => {
    expect(sizedImage(hero, 700)).toBe(`${hero}?format=750w`);
    expect(sizedImage(`${hero}?format=2500w`, 1000)).toBe(`${hero}?format=1000w`);
    expect(sizedImage(hero, 9999)).toBe(`${hero}?format=2500w`);
  });

  it("leaves every other address exactly as it is", () => {
    for (const url of ["/assets/x.jpg", "https://zhdqjtgtolnksiaepxbd.supabase.co/storage/v1/object/public/a.jpg", ""]) {
      expect(sizedImage(url, 750)).toBe(url);
      expect(responsiveImage(url)).toEqual({ src: url });
    }
  });

  it("gives the browser a set of widths to choose from", () => {
    const r = responsiveImage(hero, "(min-width: 1024px) 25vw, 100vw", 750, [500, 750, 1000]);
    expect(r.src).toBe(`${hero}?format=750w`);
    expect(r.srcSet).toBe(`${hero}?format=500w 500w, ${hero}?format=750w 750w, ${hero}?format=1000w 1000w`);
    expect(r.sizes).toBe("(min-width: 1024px) 25vw, 100vw");
  });

  it("the home hero, its Signature cards, the Signature page and the treatment cards use it", () => {
    expect(read("src/pages/Index.tsx")).toMatch(/\{\.\.\.responsiveImage\(hero\.backgroundImage\)\}\s*\{\.\.\.HERO_IMAGE_FIRST\}/);
    expect(read("src/pages/Index.tsx")).toMatch(/\{\.\.\.responsiveImage\(\s*\(exp as any\)\.image/);
    expect(read("src/pages/SignatureTreatments.tsx")).toMatch(/responsiveImage\(treatment\.image/);
    expect(read("src/components/ServiceCard.tsx")).toMatch(/\{\.\.\.responsiveImage\(/);
  });

  it("no photo bundled with the site weighs more than 350 KB", () => {
    const heavy: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        // social-share.jpg is the link-preview picture for WhatsApp/Facebook — visitors never download it.
        else if (/\.(jpe?g|png|webp)$/i.test(name) && name !== "social-share.jpg" && statSync(p).size > 350 * 1024) heavy.push(p);
      }
    };
    walk(resolve(root, "src/assets"));
    walk(resolve(root, "public/images"));
    expect(heavy).toEqual([]);
  });
});

describe("taps and scrolling on phones", () => {
  it("the navbar's frosted blur is kept for tablets and desktop only", () => {
    const nav = read("src/components/Navbar.tsx");
    expect(nav).toMatch(/fixed top-0 left-0 right-0 z-50 bg-background\/95 md:bg-background\/80 md:backdrop-blur-md/);
  });

  it("buttons show they were pressed right away, and taps don't wait for a double-tap zoom", () => {
    expect(read("src/components/ui/button.tsx")).toMatch(/active:scale-\[0\.98\] active:duration-75/);
    const css = read("src/index.css");
    expect(css).toMatch(/-webkit-tap-highlight-color: transparent/);
    expect(css).toMatch(/touch-action: manipulation/);
  });
});
