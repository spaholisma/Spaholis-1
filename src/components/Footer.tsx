import { Link } from "react-router-dom";
import holisLogo from "@/assets/holis-logo-clean.png";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { RichText } from "@/components/ui/rich-text";
import { HOLIS_WHATSAPP_URL, formatWhatsAppDisplay } from "@/lib/whatsapp";

export function Footer() {
  const { data: content } = useSiteContent();
  const footer = content?.footer || defaults.footer;

  return (
    <footer className="bg-spa-charcoal text-spa-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <img src={holisLogo} alt="Holis Wellness Center" className="h-12 w-auto mb-4 brightness-0 invert" />
            <p className="font-body text-sm text-spa-sand/90 max-w-sm leading-relaxed">
              <RichText value={footer.description} path="footer.description" />
            </p>
          </div>
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4 text-spa-sand">{footer.quickLinksTitle || "Quick Links"}</h4>
            <div className="space-y-2">
              {footer.quickLinks.map((link) => (
                <Link key={link.to} to={link.to} className="block text-sm text-spa-sand/80 hover:text-spa-cream transition-colors font-body">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4 text-spa-sand">{footer.contactTitle || "Contact"}</h4>
            <div className="space-y-2 text-sm text-spa-sand/80 font-body">
              {footer.contact.address.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <p>
                <a href={`mailto:${footer.contact.email}`} className="hover:text-spa-cream transition-colors">
                  {footer.contact.email}
                </a>
              </p>
              <p>
                <a
                  href={HOLIS_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-spa-cream transition-colors"
                >
                  WhatsApp: {formatWhatsAppDisplay()}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-spa-sand/20 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-spa-sand/70 font-body order-2 md:order-1"><RichText value={footer.copyright} path="footer.copyright" /></p>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-body order-1 md:order-2">
            <Link to="/education" className="text-spa-sand/80 hover:text-spa-cream transition-colors">
              Education
            </Link>
            <Link to="/sas-practitioners" className="text-spa-sand/80 hover:text-spa-cream transition-colors">
              SAS Practitioners
            </Link>
            <Link to="/terms" className="text-spa-sand/80 hover:text-spa-cream transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link to="/privacy" className="text-spa-sand/80 hover:text-spa-cream transition-colors">
              Privacy Policy
            </Link>
            <Link to="/refund" className="text-spa-sand/80 hover:text-spa-cream transition-colors">
              Refund Policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
