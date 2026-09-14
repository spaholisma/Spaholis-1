// Display currency is USD everywhere.
//
// Prices are stored in the database directly in USD (numeric, e.g. 23.00).
// The Colones-era conversion has been removed — see the reversion migration
// that follows 20260424145426_*.sql. `USD_RATE` is kept as `1` and the
// function names are preserved so existing call sites keep working without
// changing their semantics.

export const PRIMARY_CURRENCY = "USD" as const;

/**
 * @deprecated Kept for backwards compatibility with call sites that used to
 * multiply/divide by the CRC exchange rate. Now equal to 1 — do not
 * introduce new multiplications by this constant.
 */
export const USD_RATE = 1;

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const usdPreciseFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function toNumber(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @deprecated Prices are already stored in USD. This is now an identity
 * helper kept so existing call sites don't need to change.
 */
export function crcToUsd(usd: number | string | null | undefined): number {
  return Math.round(toNumber(usd) * 100) / 100;
}

/**
 * Format a stored price (USD) as a display string, e.g. `$23` or `$85`.
 * Rounds to a whole dollar to keep the compact card/menu layout.
 */
export function formatCRC(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n <= 0) return "$0";
  return `$${usdCompactFormatter.format(Math.round(n))}`;
}

/**
 * An amount exactly as it will be charged: whole dollars stay whole (`$131`),
 * anything with cents shows them (`$111.35`). formatCRC rounds to the dollar,
 * which is right for a menu price but wrong once a coupon is involved — a 15%
 * discount of $19.65 read as "$20 off", which looks like a 20% coupon.
 */
export function formatPrice(value: number | string | null | undefined): string {
  const n = Math.round(toNumber(value) * 100) / 100;
  if (n <= 0) return "$0";
  return Number.isInteger(n) ? `$${usdCompactFormatter.format(n)}` : `$${usdPreciseFormatter.format(n)}`;
}

/** Precise two-decimal formatter used in checkout summaries and emails. */
export function formatUsd(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n <= 0) return "$0.00";
  return `$${usdPreciseFormatter.format(n)}`;
}

/**
 * @deprecated Was used to render an "≈ $x USD" hint next to a CRC price.
 * Prices are now already USD, so this returns an empty string and is safe
 * to drop from call sites over time.
 */
export function formatUsdRef(_value: number | string | null | undefined): string {
  return "";
}

/** Public-facing USD price. */
export function formatCRCWithUsd(value: number | string | null | undefined): string {
  return formatCRC(value);
}
