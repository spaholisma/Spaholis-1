import { supabase } from "@/integrations/supabase/client";
import type { PartnerLink } from "@/data/partnerLinks";

/**
 * Counts a partner QR scan on our own server — which partner and which of its
 * places, nothing about the person (no IP, no device, no cookie). This is the
 * count that does not need the visitor's consent; Google Analytics only hears
 * about the scan if they already accepted analytics.
 *
 * Never holds the visitor up: resolves when saved, on error, or after `waitMs`.
 */
export function recordQrScan(slug: string, link: PartnerLink, waitMs = 1200): Promise<void> {
  let saved: Promise<void>;
  try {
    saved = Promise.resolve(
      (supabase as any).rpc("record_partner_qr_scan", {
        _slug: slug,
        _partner: link.partner,
        _property: link.property ?? null,
        _destination: link.destination,
      }),
    ).then(() => undefined, () => undefined);
  } catch {
    saved = Promise.resolve(); // the visitor still goes on to WhatsApp
  }
  const timeout = new Promise<void>((r) => setTimeout(r, waitMs));
  return Promise.race([saved, timeout]);
}
