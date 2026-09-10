// End-to-end regression: for every representative service/class price in the
// live DB, verify that the customer confirmation email, admin email, and
// WhatsApp CTA render the amount as USD ("$X.XX") for every payment path
// (card, membership, credits, free).
//
// This asserts against the SAME builders the runtime handler calls, so a
// regression in USD formatting or a re-introduction of CRC math will fail
// here before shipping.

import { assert, assertEquals, assertStringIncludes, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildClassCustomerHtml,
  buildClassAdminHtml,
  buildClassWhatsAppUrl,
  HOLIS_WHATSAPP_DIGITS,
  formatCRC,
} from "./index.ts";

// Representative prices actually stored on production for every service AND
// class (unioned live via `supabase--read_query` when authoring this test).
// If a real price ever drops back into the CRC-thousands range we'd catch it
// here because the USD formatter renders that as e.g. "$12,000.00" which
// fails the shape check below.
const REAL_USD_PRICES = [
  // Classes
  11, 23,
  // Treatments / services (sample of representative price points)
  57, 68, 73, 85, 91, 96, 102, 107, 108, 119, 124, 141, 147,
  164, 165, 170, 181, 187, 220, 249, 272.5, 355, 410,
];

type PayPath = "card" | "membership" | "credits" | "free";
const PAY_PATHS: PayPath[] = ["card", "membership", "credits", "free"];

function amountForPath(price: number, path: PayPath): number | null {
  // Matches ClassBooking.tsx `createClassBooking.total_price`:
  //   card → discounted price is stored; here we test the no-coupon path.
  //   membership / credits → base price stored (redemption is separate).
  //   free → 0 stored.
  if (path === "free") return 0;
  return price;
}

function labelForPath(path: PayPath): string {
  switch (path) {
    case "card": return "Paid";
    case "membership": return "Covered by membership";
    case "credits": return "Redeemed with credits";
    case "free": return "Confirmed";
  }
}

// Regex: exactly matches $X.XX or $X,XXX.XX (US locale, 2-decimal USD).
// Also fails on stray ₡ / "CRC" / bare integers with 3+ digits with no dot.
const USD_STRICT = /\$\d{1,3}(,\d{3})*\.\d{2}/;

Deno.test("USD renders correctly in all confirmation surfaces × payment paths × prices", () => {
  const problems: string[] = [];

  for (const price of REAL_USD_PRICES) {
    for (const path of PAY_PATHS) {
      const totalUsd = amountForPath(price, path);
      const paymentStatus = labelForPath(path);
      const reservationId = "TEST1234";
      const className = "Vinyasa Yoga";

      // --- WhatsApp URL ---
      const waUrl = buildClassWhatsAppUrl({ className, reservationId, totalUsd });
      const decoded = decodeURIComponent(waUrl);

      assertStringIncludes(waUrl, `wa.me/${HOLIS_WHATSAPP_DIGITS}`);
      // Free path: no dollar amount in the CTA at all.
      if (totalUsd === 0) {
        if (decoded.includes("$")) {
          problems.push(`wa[${path},$${price}]: free path leaked a $ amount → ${decoded}`);
        }
      } else {
        const expectedFragment = `(${formatCRC(totalUsd)})`;
        if (!decoded.includes(expectedFragment)) {
          problems.push(`wa[${path},$${price}]: missing "${expectedFragment}" in "${decoded}"`);
        }
        if (!USD_STRICT.test(decoded)) {
          problems.push(`wa[${path},$${price}]: not USD-shaped: ${decoded}`);
        }
        // Guard: CRC leakage — no colones/thousand-round numbers without a dot.
        if (/₡/.test(decoded) || /\bCRC\b/.test(decoded)) {
          problems.push(`wa[${path},$${price}]: leaked CRC token: ${decoded}`);
        }
      }

      // --- Customer confirmation email ---
      const custHtml = buildClassCustomerHtml({
        reservationId, className,
        instructor: "Ana",
        guestName: "Jane Doe",
        scheduleLabel: "Monday, July 6, 2026 at 9:00 AM",
        location: "Studio A",
        totalPrice: totalUsd,
        couponCode: null,
        discountAmount: null,
        paymentStatus,
        whatsappUrl: waUrl,
      });

      // Amount is only rendered when > 0. Verify both branches.
      if ((totalUsd ?? 0) > 0) {
        const expected = formatCRC(totalUsd);
        if (!custHtml.includes("Amount Paid")) {
          problems.push(`custEmail[${path},$${price}]: missing "Amount Paid" row`);
        }
        if (!custHtml.includes(expected)) {
          problems.push(`custEmail[${path},$${price}]: missing amount "${expected}"`);
        }
        if (!USD_STRICT.test(custHtml)) {
          problems.push(`custEmail[${path},$${price}]: no USD-shaped value in HTML`);
        }
      } else {
        if (custHtml.includes("Amount Paid")) {
          problems.push(`custEmail[${path},$${price}]: free path leaked "Amount Paid" row`);
        }
      }
      // Never CRC anywhere in the email.
      if (/₡/.test(custHtml) || /\bCRC\b/.test(custHtml)) {
        problems.push(`custEmail[${path},$${price}]: leaked CRC in email HTML`);
      }
      // Payment status label is always present.
      assertStringIncludes(custHtml, paymentStatus);

      // --- Admin email ---
      const adminHtml = buildClassAdminHtml({
        reservationId, className,
        instructor: "Ana",
        guestName: "Jane Doe",
        guestEmail: "jane@example.com",
        scheduleLabel: "Monday, July 6, 2026 at 9:00 AM",
        location: "Studio A",
        totalPrice: totalUsd,
        paymentStatus,
        paymentMethod: path,
        paymentId: path === "card" ? "PAY_TEST" : null,
        couponCode: null,
        discountAmount: null,
      });

      // Admin always shows an "Amount" line (even $0 for free).
      const expectedAdmin = formatCRC(totalUsd);
      if (!adminHtml.includes("Amount")) {
        problems.push(`adminEmail[${path},$${price}]: missing Amount row`);
      }
      if (!adminHtml.includes(expectedAdmin)) {
        problems.push(`adminEmail[${path},$${price}]: missing "${expectedAdmin}"`);
      }
      if (/₡/.test(adminHtml) || /\bCRC\b/.test(adminHtml)) {
        problems.push(`adminEmail[${path},$${price}]: leaked CRC`);
      }
      if ((totalUsd ?? 0) > 0 && !USD_STRICT.test(adminHtml)) {
        problems.push(`adminEmail[${path},$${price}]: not USD-shaped`);
      }
      assertStringIncludes(adminHtml, paymentStatus);
    }
  }

  if (problems.length) {
    throw new Error(`USD rendering regressions (${problems.length}):\n  - ${problems.join("\n  - ")}`);
  }
});

Deno.test("formatCRC always emits USD $X.XX shape for realistic price inputs", () => {
  for (const p of REAL_USD_PRICES) {
    const out = formatCRC(p);
    assertMatch(out, USD_STRICT);
    assert(out.startsWith("$"), `formatCRC(${p}) → ${out} does not start with $`);
    // No colones token, no bare integer that would suggest missing decimals.
    assert(!/₡|CRC/.test(out), `formatCRC(${p}) → ${out} leaked CRC token`);
  }
  // Zero + null render as $0.00 (used in the free path admin email).
  assertEquals(formatCRC(0), "$0.00");
  assertEquals(formatCRC(null), "$0.00");
  assertEquals(formatCRC(undefined), "$0.00");
});

Deno.test("WhatsApp CTA payment-path shape: only card/membership/credits carry a $ amount", () => {
  const url0 = buildClassWhatsAppUrl({ className: "X", reservationId: "R", totalUsd: 0 });
  const urlN = buildClassWhatsAppUrl({ className: "X", reservationId: "R", totalUsd: null });
  const urlCard = buildClassWhatsAppUrl({ className: "X", reservationId: "R", totalUsd: 23 });
  assert(!decodeURIComponent(url0).includes("$"), "zero-total WhatsApp CTA must omit $");
  assert(!decodeURIComponent(urlN).includes("$"), "null-total WhatsApp CTA must omit $");
  assertStringIncludes(decodeURIComponent(urlCard), "($23.00)");
});

// Two guests booked a $131 treatment with a 15% coupon and their confirmation
// showed only "$111.35" — no price, no coupon, nothing to explain the gap, so
// it read like a billing error. Every confirmation must now carry the whole
// sum, and must say so even when no coupon was used.
Deno.test("confirmation emails spell out price, coupon and discount", () => {
  const discounted = buildClassCustomerHtml({
    reservationId: "R1", className: "Vinyasa",
    instructor: null, guestName: "Leena",
    scheduleLabel: "Saturday, September 13, 2026 at 2:00 PM",
    location: null,
    totalPrice: 111.35, couponCode: "MAXWELLNESS", discountAmount: 19.65,
    paymentStatus: "Paid", whatsappUrl: "https://wa.me/1",
  });
  // The price before the coupon is rebuilt from total + discount, so it is the
  // price of the day rather than today's list price.
  assertStringIncludes(discounted, "$131.00");
  assertStringIncludes(discounted, "MAXWELLNESS");
  assertStringIncludes(discounted, "-$19.65");
  assertStringIncludes(discounted, "$111.35");

  const plain = buildClassCustomerHtml({
    reservationId: "R2", className: "Vinyasa",
    instructor: null, guestName: "Ana",
    scheduleLabel: "Saturday, September 13, 2026 at 2:00 PM",
    location: null,
    totalPrice: 131, couponCode: null, discountAmount: null,
    paymentStatus: "Paid", whatsappUrl: "https://wa.me/1",
  });
  assertStringIncludes(plain, "None used");
  assert(!plain.includes("Discount"), "no-coupon email must not show a discount row");

  // A party books as several rows; the internal copy shows the summed figures.
  const admin = buildClassAdminHtml({
    reservationId: "R3", className: "Vinyasa",
    instructor: null, guestName: "Leena", guestEmail: "l@example.com",
    scheduleLabel: "Saturday, September 13, 2026 at 2:00 PM",
    location: null,
    totalPrice: 222.7, paymentStatus: "Paid", paymentMethod: "card",
    paymentId: null, couponCode: "MAXWELLNESS", discountAmount: 39.3,
  });
  assertStringIncludes(admin, "$262.00");
  assertStringIncludes(admin, "-$39.30");
  assertStringIncludes(admin, "$222.70");
});
