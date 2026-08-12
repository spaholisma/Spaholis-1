/**
 * Runtime theme (color palette + roundness) editable from the admin.
 * Values are stored as CSS-ready HSL strings ("H S% L%") and applied to CSS
 * custom properties on :root. Each palette color maps to its spa-* token plus
 * the shadcn aliases that mirror it, so changing one brand color recolors
 * buttons, accents and backgrounds consistently.
 */

export type ThemeColorKey = "sand" | "sage" | "stone" | "cream" | "charcoal" | "background";

export interface Theme {
  colors: Record<ThemeColorKey, string>; // "H S% L%"
  radius: number; // rem
}

export const THEME_LABELS: Record<ThemeColorKey, string> = {
  sand: "Sand (primary / buttons)",
  sage: "Sage (green accent)",
  stone: "Stone (secondary)",
  cream: "Cream (light text / cards)",
  charcoal: "Charcoal (dark sections)",
  background: "Background",
};

// Defaults mirror src/index.css :root.
export const DEFAULT_THEME: Theme = {
  colors: {
    sand: "25 30% 77%",
    sage: "140 15% 55%",
    stone: "30 8% 60%",
    cream: "36 50% 97%",
    charcoal: "0 0% 18%",
    background: "30 33% 95%",
  },
  radius: 0.75,
};

// Each palette color drives these CSS variables.
const VAR_MAP: Record<ThemeColorKey, string[]> = {
  sand: ["--spa-sand", "--primary", "--ring", "--sidebar-primary", "--sidebar-ring"],
  sage: ["--spa-sage", "--accent"],
  stone: ["--spa-stone", "--secondary"],
  cream: ["--spa-cream"],
  charcoal: ["--spa-charcoal"],
  background: ["--spa-warm", "--background"],
};

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  (Object.keys(VAR_MAP) as ThemeColorKey[]).forEach((key) => {
    const val = theme.colors[key];
    if (!val) return;
    VAR_MAP[key].forEach((cssVar) => root.style.setProperty(cssVar, val));
  });
  if (typeof theme.radius === "number") root.style.setProperty("--radius", `${theme.radius}rem`);
}

export function clearTheme(root: HTMLElement = document.documentElement) {
  Object.values(VAR_MAP).flat().forEach((v) => root.style.removeProperty(v));
  root.style.removeProperty("--radius");
}

/* ── HSL <-> HEX helpers (CSS stores "H S% L%") ── */
export function hslStrToHex(hsl: string): string {
  const m = hsl.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return "#000000";
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToHslStr(hex: string): string {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
