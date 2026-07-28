// Membership expiry: a "monthly" membership should end on the SAME day of the
// following month (activated Jul 27 → expires Aug 27), not exactly 30 days
// later. When the duration is a whole number of months (multiples of 30 days)
// we add calendar months; otherwise we fall back to adding days.
export function membershipExpiryISO(
  durationDays: number | null | undefined,
  from: Date = new Date(),
): string | null {
  if (!durationDays || durationDays <= 0) return null;
  const d = new Date(from);
  if (durationDays % 30 === 0) {
    const months = durationDays / 30;
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    // Month overflow guard (e.g. Jan 31 + 1 month): clamp to the month's last day.
    if (d.getDate() < day) d.setDate(0);
  } else {
    d.setDate(d.getDate() + durationDays);
  }
  return d.toISOString();
}
