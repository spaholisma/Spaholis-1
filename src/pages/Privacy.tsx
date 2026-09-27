import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="Privacy Policy | Holis Wellness Center"
        description="How Holis Wellness Center collects, uses, and protects your personal information."
        canonical="/privacy"
      />
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <h1 className="font-heading text-4xl md:text-5xl text-foreground mb-8">
          Privacy Policy
        </h1>
        <div className="space-y-6 font-body text-foreground/90 leading-relaxed">
          <p>Last updated: May 2026.</p>

          <h2 className="font-heading text-2xl mt-8">Information We Collect</h2>
          <p>
            When you book a service or create an account we collect your name,
            email, phone number, and the health/intake information you provide.
            processor (BAC CompraClick) — we never store full card numbers.
          </p>

          <h2 className="font-heading text-2xl mt-8">How We Use It</h2>
          <p>
            We use your information to confirm bookings, deliver services,
            provide customer support, and send booking-related notifications.
            We do not sell your personal data.
          </p>

          <h2 className="font-heading text-2xl mt-8">Data Storage</h2>
          <p>
            Data is stored on secure cloud infrastructure with row-level access
            controls. Only authorized staff can view client records.
          </p>

          <h2 className="font-heading text-2xl mt-8">Your Rights</h2>
          <p>
            You may request access, correction, or deletion of your personal
            data at any time by emailing{" "}
            <a className="underline" href="mailto:spaholisma@gmail.com">
              spaholisma@gmail.com
            </a>
            .
          </p>

          <h2 className="font-heading text-2xl mt-8">Cookies</h2>
          <p>
            This site uses essential cookies required for authentication and
            booking. No third-party advertising cookies are used.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
