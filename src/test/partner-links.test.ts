import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESCAPE_VILLAS_PROPERTIES, PARTNER_LINKS, partnerDestinationUrl } from "@/data/partnerLinks";
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

describe("the Casa Fantastica link", () => {
  const link = PARTNER_LINKS["casa-fantastica"];

  it("is counted as a scan of the printed material, headed to WhatsApp", () => {
    expect(link).toMatchObject({ partner: "casa_fantastica", placement: "printed_material", destination: "whatsapp" });
  });

  it("opens the Holis WhatsApp with the whole message already typed", () => {
    const url = new URL(partnerDestinationUrl(link));
    expect(`${url.origin}${url.pathname}`).toBe("https://api.whatsapp.com/send");
    expect(url.searchParams.get("phone")).toBe("50688146760");
    expect(url.searchParams.get("text")).toBe(
      "Hello! I discovered Holis Wellness Center through Casa Fantastica and would like more information about your wellness experiences. 🌿",
    );
  });
});

describe("the Escape Villas links", () => {
  const villas = Object.entries(PARTNER_LINKS).filter(([slug]) => slug.startsWith("escape-villas-"));

  it("13 houses: Rising and the 2 Tango Houses plus the other 12", () => {
    expect(villas.map(([slug]) => slug)).toEqual([
      "escape-villas-rising-tango-houses",
      "escape-villas-casa-samba",
      "escape-villas-dolce-vita",
      "escape-villas-dos-vistas",
      "escape-villas-casa-magnifica",
      "escape-villas-casa-del-sol",
      "escape-villas-casa-querencia",
      "escape-villas-saltwater",
      "escape-villas-casa-brisas",
      "escape-villas-tree-house",
      "escape-villas-zest",
      "escape-villas-vista-azul",
      "escape-villas-fantastica",
    ]);
  });

  it("each counts as escape_villas with its own property, and names its house in the message", () => {
    for (const p of ESCAPE_VILLAS_PROPERTIES) {
      const link = PARTNER_LINKS[`escape-villas-${p.slug}`];
      expect(link).toEqual({
        partner: "escape_villas",
        property: p.property,
        placement: "printed_material",
        destination: "whatsapp",
        message: `Hello! I discovered Holis Wellness Center while staying at ${p.name} through Escape Villas, and I would like more information about your wellness experiences. 🌿`,
      });
    }
    const properties = villas.map(([, l]) => l.property);
    expect(new Set(properties).size).toBe(13);
    expect(PARTNER_LINKS["escape-villas-casa-samba"].message).toMatch(/staying at Casa Samba through Escape Villas,/);
  });

  it("Rising and the 2 Tango Houses is one property: one link, one message, one Analytics name", () => {
    const link = PARTNER_LINKS["escape-villas-rising-tango-houses"];
    expect(link).toMatchObject({ partner: "escape_villas", property: "rising_tango_houses", placement: "printed_material", destination: "whatsapp" });
    expect(new URL(partnerDestinationUrl(link)).searchParams.get("text")).toBe(
      "Hello! I discovered Holis Wellness Center while staying at Rising and the 2 Tango Houses (Mango and Romeo) through Escape Villas, and I would like more information about your wellness experiences. 🌿",
    );
    expect(Object.keys(PARTNER_LINKS).filter((s) => /rising|tango|mango|romeo/.test(s))).toEqual(["escape-villas-rising-tango-houses"]);
  });
});

describe("every partner link", () => {
  const all = Object.entries(PARTNER_LINKS);

  it("has a url-safe slug, its own Analytics name, and opens the Holis WhatsApp", () => {
    const names = all.map(([, l]) => `${l.partner}/${l.property ?? ""}`);
    expect(new Set(names).size).toBe(names.length);
    for (const [slug, link] of all) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(link.partner).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
      if (link.property !== undefined) expect(link.property).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(link).toMatchObject({ placement: "printed_material", destination: "whatsapp" });
      const url = new URL(partnerDestinationUrl(link));
      expect(`${url.origin}${url.pathname}`).toBe("https://api.whatsapp.com/send");
      expect(url.searchParams.get("phone")).toBe("50688146760");
      expect(url.searchParams.get("text")).toBe(link.message);
      expect(link.message.endsWith(" 🌿")).toBe(true);
    }
  });
});

describe("the /go page", () => {
  const page = read("src/pages/PartnerRedirect.tsx");

  it("is a route in English and Spanish", () => {
    expect(read("src/App.tsx")).toMatch(/\{ path: "\/go\/:slug", element: <PartnerRedirect \/> \}/);
  });

  it("sends partner_qr_scan with the three parameters, then leaves — never waits forever", () => {
    expect(GA4_MEASUREMENT_ID).toBe("G-W4GMPQKK5N");
    expect(page).toMatch(/\("event", "partner_qr_scan", \{\s+partner: link\.partner,\s+\.\.\.\(link\.property \? \{ property: link\.property \} : \{\}\),\s+placement: link\.placement,\s+destination: link\.destination,/);
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
