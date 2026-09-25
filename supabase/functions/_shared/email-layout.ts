// The shell every Holis email is poured into.
//
// Most of our mail is read on a phone, and until now every message went out
// with nothing but `<meta charset>` in its head. Without a viewport line a
// phone lays the message out at 980px and then shrinks the whole thing to fit
// the screen — which is why they arrived tiny and had to be pinched open.
//
// This module fixes that once, for every email:
//   · the viewport line, so the phone uses its own width
//   · a small stylesheet that gives phones their margins back and stacks the
//     two-column detail tables into label-over-value cards
//   · long words (emails, links, reservation codes) break instead of pushing
//     the layout sideways
//
// On a laptop the mail looks exactly as it did before: every rule here is
// either a head tag or lives inside `@media (max-width:480px)`.

/** Head tags + the phone stylesheet. `title` shows in some web clients. */
export function emailHead(title = "Holis Wellness Center"): string {
  return `<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<style>
  img{max-width:100%!important;height:auto!important}
  a,td,p,li,h1,h2,h3{word-break:break-word;overflow-wrap:anywhere}
  table{max-width:100%}
  @media only screen and (max-width:480px){
    .wrap{padding:10px!important}
    .head{padding:22px 18px!important}
    .pad{padding:20px 18px!important}
    .h1{font-size:20px!important;line-height:1.3!important}
    .fine{font-size:14px!important;line-height:1.6!important}
    .foot{font-size:13px!important}
    .btn{display:block!important;text-align:center!important}
    /* Columns a phone has no room for. The important ones stay. */
    .hide-sm{display:none!important}
    /* Two-column detail tables become one card per row: the label on top,
       the value underneath, so nothing is squeezed into a 90px column. */
    .t tr{display:block!important;border:1px solid #ddd;border-radius:8px;margin:0 0 8px;overflow:hidden}
    .t td{display:block!important;width:auto!important;border:0!important}
    .t td.k{background:#faf7f4;font-size:12px!important;text-transform:uppercase;letter-spacing:.5px;color:#666;padding:8px 12px 4px!important}
    .t td.v{font-size:15px!important;padding:0 12px 10px!important}
  }
</style>
</head>`;
}

const BODY_STYLE =
  "margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f1ec;-webkit-text-size-adjust:100%;";

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The dark-header card used by the booking, loyalty and order emails. */
export function emailShell(
  heading: string,
  inner: string,
  opts: { footer?: string; title?: string; headerBackground?: string } = {},
): string {
  const footer = opts.footer ?? "Holis Wellness Center · spaholis.com";
  // A cancellation wears a different colour than a confirmation.
  const headerBg = opts.headerBackground ?? "#2F2F2F";
  return `<!DOCTYPE html><html lang="en">${emailHead(opts.title ?? heading)}
  <body style="${BODY_STYLE}">
    <div class="wrap" style="padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <div class="head" style="background:${headerBg};padding:28px;text-align:center;">
          <h1 class="h1" style="color:#F5F1EC;font-size:22px;margin:0;">${heading}</h1>
        </div>
        <div class="pad" style="padding:28px;color:#2F2F2F;">${inner}</div>
        <div class="foot" style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
          ${footer}
        </div>
      </div>
    </div>
  </body></html>`;
}

/**
 * For messages that are written as a loose block of HTML rather than a card:
 * they still need the head, the background and the phone rules.
 */
export function emailDocument(inner: string, title = "Holis Wellness Center"): string {
  return `<!DOCTYPE html><html lang="en">${emailHead(title)}
  <body style="${BODY_STYLE}">
    <div class="wrap" style="padding:20px;">${inner}</div>
  </body></html>`;
}

/** One line of a detail table. The classes are what let it stack on a phone. */
export function detailsRow(label: string, value: string): string {
  return `<tr><td class="k" style="padding:6px 10px;border:1px solid #ddd;font-weight:600;width:40%;">${label}</td>` +
    `<td class="v" style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`;
}

export function detailsTable(rows: string[]): string {
  return `<table class="t" style="width:100%;border-collapse:collapse;font-size:14px;">${rows.join("")}</table>`;
}

/**
 * A tappable button. 44px is the smallest target a thumb hits reliably, so the
 * padding here is not decoration.
 */
export function emailButton(
  href: string,
  label: string,
  opts: { background?: string; color?: string; border?: string } = {},
): string {
  const bg = opts.background ?? "#2F2F2F";
  const color = opts.color ?? "#ffffff";
  const border = opts.border ?? bg;
  return `<a class="btn" href="${href.replace(/&/g, "&amp;")}" style="display:inline-block;background:${bg};border:1px solid ${border};color:${color};padding:12px 20px;border-radius:6px;font-size:15px;line-height:1.2;text-decoration:none;">${label}</a>`;
}
