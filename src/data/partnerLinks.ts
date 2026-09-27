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

/** MAV Rentals houses. */
export const MAV_RENTALS_PROPERTIES = [
  { slug: "beach-house", property: "beach_house", name: "Beach House" },
  { slug: "casa-bellamar", property: "casa_bellamar", name: "Casa Bellamar" },
  { slug: "vista-hermosa", property: "vista_hermosa", name: "Vista Hermosa" },
  { slug: "casa-tranquilidad", property: "casa_tranquilidad", name: "Casa Tranquilidad" },
  { slug: "casa-bamboo", property: "casa_bamboo", name: "Casa Bamboo" },
  { slug: "casa-elsa", property: "casa_elsa", name: "Casa Elsa" },
  { slug: "casa-roja", property: "casa_roja", name: "Casa Roja" },
  { slug: "casa-calma", property: "casa_calma", name: "Casa Calma" },
  { slug: "casa-serena", property: "casa_serena", name: "Casa Serena" },
  { slug: "casa-prana", property: "casa_prana", name: "Casa Prana" },
] as const;

type Property = { slug: string; property: string; name: string };

/** One link per house of a rental company: /go/<prefix>-<slug>, counted as the
 *  company with the house in `property`, the message naming both. */
function propertyLinks(prefix: string, partner: string, company: string, houses: readonly Property[]) {
  return Object.fromEntries(
    houses.map((p) => [
      `${prefix}-${p.slug}`,
      {
        partner,
        property: p.property,
        placement: "printed_material",
        destination: "whatsapp",
        message: `Hello! I discovered Holis Wellness Center while staying at ${p.name} through ${company}, and I would like more information about your wellness experiences. 🌿`,
      } satisfies PartnerLink,
    ]),
  );
}

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
  "costa-vida": {
    partner: "costa_vida",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Costa Vida and would like more information about your wellness experiences. 🌿",
  },
  "karabi-villas": {
    partner: "karabi_villas",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Karabi Villas and would like more information about your wellness experiences. 🌿",
  },
  "jungle-roost": {
    partner: "jungle_roost",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Jungle Roost and would like more information about your wellness experiences. 🌿",
  },
  "casa-kiskadee": {
    partner: "casa_kiskadee",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Casa Kiskadee and would like more information about your wellness experiences. 🌿",
  },
  southern: {
    partner: "southern",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Southern and would like more information about your wellness experiences. 🌿",
  },
  // Not the Escape Villas "Rising and the 2 Tango Houses" — a different place.
  "rising-sun": {
    partner: "rising_sun",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Rising Sun and would like more information about your wellness experiences. 🌿",
  },
  "casa-contee": {
    partner: "casa_contee",
    placement: "printed_material",
    destination: "whatsapp",
    message:
      "Hello! I discovered Holis Wellness Center through Casa Contee and would like more information about your wellness experiences. 🌿",
  },
  ...propertyLinks("escape-villas", "escape_villas", "Escape Villas", ESCAPE_VILLAS_PROPERTIES),
  ...propertyLinks("mav-rentals", "mav_rentals", "MAV Rentals", MAV_RENTALS_PROPERTIES),
};

// api.whatsapp.com rather than wa.me: wa.me's own redirect turns emoji (the
// 🌿 at the end of the message) into "�"; this address keeps them.
export function partnerDestinationUrl(link: PartnerLink): string {
  return `https://api.whatsapp.com/send?phone=${HOLIS_WHATSAPP_NUMBER}&text=${encodeURIComponent(link.message)}`;
}
