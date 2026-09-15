import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="Terms & Conditions | Holis Wellness Center"
        description="Terms & Conditions for booking and purchasing services from Holis Wellness Center in Manuel Antonio, Costa Rica."
        canonical="/terms"
      />
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading text-4xl md:text-5xl text-foreground mb-8">
          Terms &amp; Conditions
        </h1>
        <div className="space-y-6 font-body text-foreground/90 leading-relaxed">
          <p>
            Last updated: September 2026. By booking, purchasing, or otherwise using
            services offered by Holis Wellness Center (“Holis”, “we”, “us”) through
            this website, you agree to the following terms.
          </p>

          <h2 className="font-heading text-2xl mt-8">1. Bookings &amp; Payment</h2>
          <p>
            Reservations are confirmed once payment is successfully processed.
            All prices are displayed in United States Dollars (USD) and are
            tax-inclusive. Payments are processed in USD by our payment provider.
          </p>

          <h2 className="font-heading text-2xl mt-8">2. Cancellations &amp; No-Shows</h2>
          <p>
            Treatment cancellations made more than 48 hours before the
            appointment are charged 50% of the total to the card on file.
            Cancellations within the 48 hours before the appointment, and
            no-shows, are charged 100% of the total. To cancel, email us at
            spaholisma@gmail.com; the time your email reaches us is the time of
            the cancellation. Changes to the treatment, date or time are
            arranged by WhatsApp or email.
          </p>

          <h2 className="font-heading text-2xl mt-8">3. Health &amp; Safety</h2>
          <p>
            You agree to provide accurate health information in your intake form
            and to inform your therapist of any condition that may affect your
            session. Our services are not a substitute for medical care.
          </p>

          <h2 className="font-heading text-2xl mt-8">4. Conduct</h2>
          <p>
            Holis reserves the right to refuse or end any session in case of
            inappropriate behavior, without refund.
          </p>

          <h2 className="font-heading text-2xl mt-8">5. Liability</h2>
          <p>
            Participation in any treatment, class, or experience is voluntary
            and at your own risk. Holis is not liable for personal injury or
            loss of property beyond what is required by applicable law.
          </p>

          <h2 className="font-heading text-2xl mt-8">6. Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a className="underline" href="mailto:spaholisma@gmail.com">
              spaholisma@gmail.com
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
