// Post-build SEO prerender.
//
// PROBLEM: this is a Vite SPA. Vercel rewrites every path to /index.html, so
// EVERY url served crawlers the same <title> and a canonical pointing at the
// homepage. Google therefore treated real pages as duplicates of "/" (Crawled –
// currently not indexed) and unknown urls as Soft 404s (HTTP 200 + generic
// shell). The <SEO> component fixes this only AFTER JavaScript runs, which is a
// second-pass render Google may take days/weeks to do — and many crawlers never
// do it at all.
//
// FIX: after `vite build`, emit one physical dist/<route>/index.html per public
// route, identical to the SPA shell except that the head carries that page's own
// title, description, canonical, og:* and hreflang. Vercel serves a matching
// static file before applying the SPA rewrite, so crawlers get correct metadata
// in the FIRST response while the app still hydrates and behaves as a SPA.
//
// Source of truth = `seo` in src/data/content.ts (title/description/canonical),
// so there is no duplicated metadata to keep in sync.

import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const BASE_URL = "https://www.spaholis.com";
const SITE_NAME = "Holis Wellness Center";
const DEFAULT_OG_IMAGE = `${BASE_URL}/images/social-share.jpg`;

/** Mirrors src/components/SEO.tsx so the static head matches what React renders. */
const fullTitle = (title) => (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`);

/**
 * Paths that exist in `seo` but are NOT standalone pages — the router answers
 * them with a <Navigate>. Prerendering a self-referencing canonical for these
 * would tell Google "this is a real page" while the app immediately redirects,
 * which is exactly how soft-404s / conflicting canonicals are created.
 * Keep in sync with the <Navigate> routes in src/App.tsx.
 */
const REDIRECT_ONLY = new Set(["/wellness"]);

/** Load the `seo` object out of the TS source (single source of truth). */
async function loadSeo() {
  const tmp = join(ROOT, "node_modules", ".cache", "seo-bundle.mjs");
  await mkdir(dirname(tmp), { recursive: true });
  await build({
    entryPoints: [join(ROOT, "src/data/content.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: tmp,
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  await rm(tmp, { force: true });
  return mod.seo;
}

/** Escape a string for safe use inside an HTML attribute. */
const attr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Replace (or insert) a tag in the <head> of the shell. */
function setHead(html, { title, description, canonical, ogImage, alternates }) {
  let out = html;

  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(title)}</title>`);

  const metaName = (name, content) => {
    const re = new RegExp(`<meta name="${name}" content="[^"]*"\\s*/?>`);
    const tag = `<meta name="${name}" content="${attr(content)}">`;
    out = re.test(out) ? out.replace(re, tag) : out.replace("</head>", `    ${tag}\n  </head>`);
  };
  const metaProp = (prop, content) => {
    const re = new RegExp(`<meta property="${prop}" content="[^"]*"\\s*/?>`);
    const tag = `<meta property="${prop}" content="${attr(content)}">`;
    out = re.test(out) ? out.replace(re, tag) : out.replace("</head>", `    ${tag}\n  </head>`);
  };

  metaName("description", description);
  metaProp("og:title", title);
  metaProp("og:description", description);
  metaProp("og:url", canonical);
  metaProp("og:image", ogImage);
  metaName("twitter:title", title);
  metaName("twitter:description", description);
  metaName("twitter:image", ogImage);

  // Self-referencing canonical — the core fix.
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${attr(canonical)}">`,
  );

  // hreflang pairs so the EN and ES versions are related rather than duplicates.
  if (alternates?.length) {
    const tags = alternates
      .map((a) => `    <link rel="alternate" hreflang="${a.lang}" href="${attr(a.href)}">`)
      .join("\n");
    out = out.replace("</head>", `${tags}\n  </head>`);
  }

  return out;
}

async function emit(routePath, html) {
  // "/" -> dist/index.html ; "/education" -> dist/education/index.html
  const rel = routePath === "/" ? "index.html" : join(routePath.replace(/^\//, ""), "index.html");
  const file = join(DIST, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  return rel;
}

/**
 * Rebuild sitemap.xml so it can't drift from the routes we actually prerender.
 * Content-driven routes (blog posts, individual retreats) are preserved from
 * the curated public/sitemap.xml, since they don't live in `seo`.
 */
async function writeSitemap(routePaths) {
  let dynamic = [];
  try {
    const existing = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
    // Keep every curated url that isn't already produced from `seo` (blog posts,
    // individual retreats, /faqs, /terms, /privacy, /classes/schedule …) so the
    // sitemap can only ever grow, never silently drop pages.
    dynamic = [...existing.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
      .map((m) => m[1].replace(BASE_URL, ""))
      .map((p) => (p === "" ? "/" : p))
      .filter((p) => p.startsWith("/") && !p.startsWith("/es/"));
  } catch {
    /* first run / no curated sitemap — fine */
  }

  const all = [...routePaths, ...dynamic];
  const seen = new Set();
  const paths = all.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));

  const entries = paths.map((p) => {
    const en = `${BASE_URL}${p === "/" ? "/" : p}`;
    const es = `${BASE_URL}${p === "/" ? "/es" : `/es${p}`}`;
    return [
      "  <url>",
      `    <loc>${en}</loc>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
      `    <xhtml:link rel="alternate" hreflang="es" href="${es}"/>`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`,
      "  </url>",
    ].join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");

  await writeFile(join(DIST, "sitemap.xml"), xml, "utf8");
  console.log(`[prerender-seo] sitemap.xml: ${paths.length} urls (${dynamic.length} content routes preserved)`);
}

async function main() {
  const seo = await loadSeo();
  const shell = await readFile(join(DIST, "index.html"), "utf8");

  // Every public route we want indexed, derived from the SEO source of truth.
  const routes = Object.values(seo)
    .filter((s) => s && typeof s.canonical === "string" && !REDIRECT_ONLY.has(s.canonical))
    .map((s) => ({ path: s.canonical, title: fullTitle(s.title), description: s.description }));

  // De-duplicate by path (defensive).
  const seen = new Set();
  const unique = routes.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));

  let count = 0;
  for (const r of unique) {
    const enUrl = `${BASE_URL}${r.path === "/" ? "/" : r.path}`;
    const esPath = r.path === "/" ? "/es" : `/es${r.path}`;
    const esUrl = `${BASE_URL}${esPath}`;
    const alternates = [
      { lang: "en", href: enUrl },
      { lang: "es", href: esUrl },
      { lang: "x-default", href: enUrl },
    ];

    // English page — canonical points at itself.
    await emit(r.path, setHead(shell, {
      title: r.title,
      description: r.description,
      canonical: enUrl,
      ogImage: DEFAULT_OG_IMAGE,
      alternates,
    }));
    count++;

    // Spanish page — canonical points at the ES url (NOT at the EN one), so the
    // two are treated as language variants instead of duplicates.
    await emit(esPath, setHead(shell, {
      title: r.title,
      description: r.description,
      canonical: esUrl,
      ogImage: DEFAULT_OG_IMAGE,
      alternates,
    }));
    count++;
  }

  console.log(`[prerender-seo] wrote ${count} pages (${unique.length} routes × EN/ES)`);

  await writeSitemap(unique.map((r) => r.path));
}

main().catch((err) => {
  console.error("[prerender-seo] failed:", err);
  process.exit(1);
});
