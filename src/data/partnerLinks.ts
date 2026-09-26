import { HOLIS_WHATSAPP_NUMBER } from "@/data/contact";

/**
 * Trackable partner links — the short urls printed on QR codes at partner
 * businesses (spaholis.com/go/<slug>). Each visit is counted in Google
 * Analytics as `partner_qr_scan` and then sent on to its destination, so the
 * printed QR never has to change when the destination does.
 */
export type PartnerLink = {
  partner: string;
  /** Which of the partner's places the QR hangs in (e.g. one Escape Villas house). */
  property?: string;
  placement: string;
  destination: "whatsapp";
  /** Message already typed in WhatsApp when the chat opens. */
  message: string;
};

/** Escape Villas houses. "Rising and the 2 Tango Houses" is ONE property. */
export const ESCAPE_VILLAS_PROPERTIES = [
  { slug: "rising-tango-houses", property: "rising_tango_houses", name: "Rising and the 2 Tango Houses (Mango and Romeo)" },
  { slug: "casa-samba", property: "casa_samba", name: "Casa Samba" },
  { slug: "dolce-vita", property: "dolce_vita", name: "Dolce Vita" },
  { slug: "dos-vistas", property: "dos_vistas", name: "Dos Vistas" },
  { slug: "casa-magnifica", property: "casa_magnifica", name: "Casa Magnifica" },
  { slug: "casa-del-sol", property: "casa_del_sol", name: "Casa del Sol" },
  { slug: "casa-querencia", property: "casa_querencia", name: "Casa Querencia" },
  { slug: "saltwater", property: "saltwater", name: "Saltwater" },
  { slug: "casa-brisas", property: "casa_brisas", name: "Casa Brisas" },
  { slug: "tree-house", property: "tree_house", name: "Tree House" },
  { slug: "zest", property: "zest", name: "Zest" },
  { slug: "vista-azul", property: "vista_azul", name: "Vista Azul" },
  { slug: "fantastica", property: "fantastica", name: "Fantastica" },
] as const;

export const PARTNER_LINKS: Record<string, PartnerLink> = {
  "emilios-cafe": {
    partner: "emilios_cafe",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Emilio’s Café and would like more information about your wellness experiences. 🌿",
  },
  "casa-fantastica": {
    partner: "casa_fantastica",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Casa Fantastica and would like more information about your wellness experiences. 🌿",
  },
  // One link per Escape Villas property: /go/escape-villas-<slug>.
  ...Object.fromEntries(
    ESCAPE_VILLAS_PROPERTIES.map((p) => [
      `escape-villas-${p.slug}`,
      {
        partner: "escape_villas",
        property: p.property,
        placement: "printed_material",
        destination: "whatsapp",
        message: `Hello! I discovered Holis Wellness Center while staying at ${p.name} through Escape Villas, and I would like more information about your wellness experiences. 🌿`,
      } satisfies PartnerLink,
    ]),
  ),
};

// api.whatsapp.com rather than wa.me: wa.me's own redirect turns emoji (the
// 🌿 at the end of the message) into "�"; this address keeps them.
export function partnerDestinationUrl(link: PartnerLink): string {
  return `https://api.whatsapp.com/send?phone=${HOLIS_WHATSAPP_NUMBER}&text=${encodeURIComponent(link.message)}`;
}
