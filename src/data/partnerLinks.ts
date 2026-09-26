import { HOLIS_WHATSAPP_NUMBER } from "@/data/contact";

/**
 * Trackable partner links — the short urls printed on QR codes at partner
 * businesses (spaholis.com/go/<slug>). Each visit is counted in Google
 * Analytics as `partner_qr_scan` and then sent on to its destination, so the
 * printed QR never has to change when the destination does.
 */
export type PartnerLink = {
  partner: string;
  placement: string;
  destination: "whatsapp";
  /** Message already typed in WhatsApp when the chat opens. */
  message: string;
};

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
};

// api.whatsapp.com rather than wa.me: wa.me's own redirect turns emoji (the
// 🌿 at the end of the message) into "�"; this address keeps them.
export function partnerDestinationUrl(link: PartnerLink): string {
  return `https://api.whatsapp.com/send?phone=${HOLIS_WHATSAPP_NUMBER}&text=${encodeURIComponent(link.message)}`;
}
