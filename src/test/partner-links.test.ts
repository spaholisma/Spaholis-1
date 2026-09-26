import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARTNER_LINKS, partnerDestinationUrl } from "@/data/partnerLinks";
import { GA4_MEASUREMENT_ID } from "@/lib/analytics";
import { shouldShowPromo } from "@/lib/promoPopup";

// The QR printed for Emilio's Café opens spaholis.com/go/emilios-cafe, which
// counts the scan in Google Analytics and then opens WhatsApp.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("the Emilio's Café link", () => {
  const link = PARTNER_LINKS["emilios-cafe"];

  it("is counted as a scan of the printed material, headed to WhatsApp", () => {
    expect(link).toMatchObject({ partner: "emilios_cafe", placement: "printed_material", destination: "whatsapp" });
  });

  it("opens the Holis WhatsApp with the whole message already typed", () => {
    const url = new URL(partnerDestinationUrl(link));
    // Not wa.me: its redirect breaks the emoji.
    expect(`${url.origin}${url.pathname}`).toBe("https://api.whatsapp.com/send");
    expect(url.searchParams.get("phone")).toBe("50688146760");
    expect(url.searchParams.get("text")).toBe(
      "Hello! I discovered Holis Wellness Center through Emilio’s Café and would like more information about your wellness experiences. 🌿",
    );
    expect(partnerDestinationUrl(link)).toMatch(/experiences\.%20%F0%9F%8C%BF$/);
  });

  it("an unknown partner slug is not a link", () => {
    expect(PARTNER_LINKS["nobody"]).toBeUndefined();
  });
});

describe("the /go page", () => {
  const page = read("src/pages/PartnerRedirect.tsx");

  it("is a route in English and Spanish", () => {
    expect(read("src/App.tsx")).toMatch(/\{ path: "\/go\/:slug", element: <PartnerRedirect \/> \}/);
  });

  it("sends partner_qr_scan with the three parameters, then leaves — never waits forever", () => {
    expect(GA4_MEASUREMENT_ID).toBe("G-W4GMPQKK5N");
    expect(page).toMatch(/\("event", "partner_qr_scan", \{\s+partner: link\.partner,\s+placement: link\.placement,\s+destination: link\.destination,/);
    expect(page).toMatch(/event_callback: go/);
    expect(page).toMatch(/window\.setTimeout\(go, MAX_WAIT_MS\)/);
    expect(page).toMatch(/window\.location\.replace\(url\)/);
  });

  it("shows the waiting text and a button in case the phone doesn't follow", () => {
    expect(page).toMatch(/Connecting you with Holis Wellness Center\.\.\./);
    expect(page).toMatch(/href=\{partnerDestinationUrl\(link\)\}/);
    expect(page).toMatch(/Continue to WhatsApp/);
    expect(page).toMatch(/noindex/);
  });

  it("loads Google Analytics only there, not on the rest of the site", () => {
    expect(read("index.html")).not.toMatch(/googletagmanager|gtag/);
  });

  it("no promo window and no floating WhatsApp button get in the way", () => {
    expect(shouldShowPromo("/go/emilios-cafe")).toBe(false);
    expect(shouldShowPromo("/es/go/emilios-cafe")).toBe(false);
    expect(shouldShowPromo("/")).toBe(true);
    expect(read("src/components/WhatsAppButton.tsx")).toMatch(/stripLangPrefix\(pathname\)\.startsWith\("\/go\/"\)/);
  });
});
