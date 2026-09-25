/**
 * Ask the browser to fetch a page's hero photo before anything else.
 *
 * React 18 only passes the attribute through in lowercase: written as
 * `fetchPriority` it was dropped from the page (with a warning), so the hint
 * never reached the browser. Its types do not know the lowercase spelling yet,
 * hence the spread.
 */
export const HERO_IMAGE_FIRST = { fetchpriority: "high" } as Record<string, string>;
