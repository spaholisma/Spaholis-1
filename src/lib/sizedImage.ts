/**
 * Photos hosted on Squarespace's image CDN can be fetched at a set width by
 * adding `?format=<n>w`. Without it the original comes down — the home hero was
 * 2.4 MB. These helpers ask for a size that fits the screen instead.
 * Any other URL (uploads, bundled files) is left exactly as it is.
 */
const SQUARESPACE_WIDTHS = [300, 500, 750, 1000, 1500, 2500] as const;

function isSquarespace(url: string): boolean {
  try {
    return new URL(url).hostname === "images.squarespace-cdn.com";
  } catch {
    return false;
  }
}

/** The Squarespace width at least as wide as `width` (or the largest). */
function cdnWidth(width: number): number {
  return SQUARESPACE_WIDTHS.find((w) => w >= width) ?? SQUARESPACE_WIDTHS[SQUARESPACE_WIDTHS.length - 1];
}

export function sizedImage(url: string, width: number): string {
  if (!url || !isSquarespace(url)) return url;
  const u = new URL(url);
  u.searchParams.set("format", `${cdnWidth(width)}w`);
  return u.toString();
}

/**
 * `src`, `srcSet` and `sizes` for an <img>: the browser picks the smallest copy
 * that is sharp on that screen. `fallbackWidth` is used where srcset isn't.
 */
export function responsiveImage(
  url: string,
  sizes = "100vw",
  fallbackWidth = 1500,
  widths: readonly number[] = [750, 1000, 1500, 2500],
) {
  if (!url || !isSquarespace(url)) return { src: url };
  return {
    src: sizedImage(url, fallbackWidth),
    srcSet: widths.map((w) => `${sizedImage(url, w)} ${cdnWidth(w)}w`).join(", "),
    sizes,
  };
}
