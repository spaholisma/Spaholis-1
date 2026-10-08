import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { CookieChoice } from "@/components/CookieChoice";

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
          <p>Last updated: October 2026.</p>

          <h2 className="font-heading text-2xl mt-8">Information We Collect</h2>
          <p>
            When you book a service or create an account we collect your name,
            email, phone number, and the health/intake information you provide.
          </p>

          <h2 className="font-heading text-2xl mt-8">Payment Cards</h2>
          <p>
            To hold a treatment booking we ask for a card and your authorization
            under our cancellation policy. We keep that card on file in
            encrypted form, together with the cardholder name, card type, last
            four digits and expiry date. Only authorized staff can reveal it,
            and only to charge a cancellation or no-show fee as described in
            the policy you accept. We never store the card's security code
            (CVV). To have a card on file deleted after your visit, email us.
          </p>
          <p>
            Online payments for classes, passes and memberships are made on the
            secure pages of PayPal or BAC CompraClick; those card numbers are
            entered there and never reach us.
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

          <h2 id="cookies" className="font-heading text-2xl mt-8 scroll-mt-28">Cookies and analytics</h2>
          <p>
            This site uses essential cookies required for authentication and
            booking. No third-party advertising cookies are used.
          </p>
          <p>
            With your permission, we also use Google Analytics (Google LLC) to
            understand which pages, services and campaigns are useful to our
            guests — for example how many visits come from Instagram or from a
            partner's QR code, and how many of them book. These analytics
            cookies are only set if you choose "Accept" in the cookie notice.
            We never send your name, email, phone number, booking details that
            identify you, or any private link to Google Analytics, and we do
            not use it for advertising.
          </p>
          <p>
            When you scan one of our partners' QR codes, we count the scan on
            our own server — which partner's code it was and when, nothing
            about you (no IP address, device or cookie) — so we know which
            partner sent you. It is sent to Google Analytics only if you have
            accepted analytics cookies.
          </p>
          <p>
            You can change your choice at any time here. Google's own policy:{" "}
            <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              policies.google.com/privacy
            </a>
            .
          </p>
          <CookieChoice />

          <div lang="es" className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-heading text-xl">Cookies y análisis (español)</h2>
            <p>
              Este sitio usa cookies esenciales para iniciar sesión y reservar.
              No usamos cookies de publicidad de terceros.
            </p>
            <p>
              Con su permiso, también usamos Google Analytics (Google LLC) para
              entender qué páginas, servicios y campañas son útiles para
              nuestros huéspedes — por ejemplo cuántas visitas llegan desde
              Instagram o desde el código QR de un socio, y cuántas reservan.
              Estas cookies de análisis solo se activan si elige "Aceptar" en el
              aviso de cookies. Nunca enviamos a Google Analytics su nombre,
              correo, teléfono, datos de reserva que le identifiquen ni enlaces
              privados, y no lo usamos para publicidad.
            </p>
            <p>
              Cuando escanea el código QR de uno de nuestros socios, contamos el
              escaneo en nuestro propio servidor — de qué socio era el código y
              cuándo, nada sobre usted (ni IP, ni dispositivo, ni cookies) —
              para saber qué socio le recomendó. Solo se envía a Google
              Analytics si aceptó las cookies de análisis.
            </p>
            <p>Puede cambiar su elección en cualquier momento con los botones de arriba.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
