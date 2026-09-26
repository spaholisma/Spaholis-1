import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import NotFound from "@/pages/NotFound";
import { PARTNER_LINKS, partnerDestinationUrl } from "@/data/partnerLinks";
import { loadGtag } from "@/lib/analytics";

// How long to wait for Google Analytics before leaving anyway (ad blockers,
// slow networks) — the visitor must never be stuck here.
const MAX_WAIT_MS = 1500;

/**
 * /go/<slug> — the page a partner's QR code opens. Counts the scan in Google
 * Analytics (`partner_qr_scan`), then goes straight on to WhatsApp. If the
 * phone doesn't follow the redirect, the button does the same.
 */
const PartnerRedirect = () => {
  const { slug = "" } = useParams();
  const link = PARTNER_LINKS[slug];
  const sent = useRef(false);

  useEffect(() => {
    if (!link || sent.current) return;
    sent.current = true;
    const url = partnerDestinationUrl(link);
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      window.location.replace(url);
    };
    const timer = window.setTimeout(go, MAX_WAIT_MS);
    try {
      loadGtag()("event", "partner_qr_scan", {
        partner: link.partner,
        placement: link.placement,
        destination: link.destination,
        transport_type: "beacon",
        event_callback: go,
        event_timeout: MAX_WAIT_MS,
      });
    } catch {
      go();
    }
    return () => window.clearTimeout(timer);
  }, [link]);

  if (!link) return <NotFound />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <SEO title="Connecting…" description="Connecting you with Holis Wellness Center." noindex />
      <div className="max-w-sm text-center">
        <div
          className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
          aria-hidden="true"
        />
        <p className="mb-6 font-heading text-xl text-foreground">Connecting you with Holis Wellness Center...</p>
        <a
          href={partnerDestinationUrl(link)}
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continue to WhatsApp
        </a>
      </div>
    </div>
  );
};

export default PartnerRedirect;
