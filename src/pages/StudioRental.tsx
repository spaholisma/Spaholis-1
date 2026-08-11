import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, Users, Sparkles, CalendarClock } from "lucide-react";
import { HOLIS_WHATSAPP_URL } from "@/lib/whatsapp";
import { useLanguage } from "@/i18n/LanguageProvider";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const HERO = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/e8d3d8e8-aeb6-4bf8-bd54-7accc0ec5b31/1.webp";

const StudioRentalPage = () => {
  const { language } = useLanguage();
  const es = language === "es";

  const idealFor = es
    ? ["Profesores de yoga y movimiento", "Talleres y formaciones", "Baños de sonido y meditación", "Eventos privados y grupales", "Sesiones de terapia y bienestar"]
    : ["Yoga & movement teachers", "Workshops & trainings", "Sound baths & meditation", "Private & group events", "Therapy & wellness sessions"];

  const included = es
    ? ["Un estudio sereno y luminoso en Manuel Antonio", "Ambiente natural y tranquilo, ideal para prácticas conscientes", "Espacio flexible para grupos pequeños y medianos", "Disponibilidad por horas o por día", "Coordinación sencilla con nuestro equipo"]
    : ["A serene, light-filled studio in Manuel Antonio", "A calm, natural setting ideal for mindful practice", "Flexible space for small and mid-size groups", "Hourly or full-day availability", "Easy coordination with our team"];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Studio Rental | Holis Wellness Center"
        description="Rent the Holis studio in Manuel Antonio for classes, workshops, sound baths, retreats and private events. A serene space for your practice."
        canonical="/studio-rental"
      />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[380px] w-full overflow-hidden">
          <img src={HERO} alt="Holis studio space" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {es ? "Alquiler de estudio" : "Studio Rental"}
            </p>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {es ? "Un espacio para tu práctica" : "A space for your practice"}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.p {...fadeIn} className="spa-body text-lg leading-relaxed max-w-3xl">
          {es
            ? "Comparte tu trabajo en un entorno pensado para el bienestar. Nuestro estudio en el corazón de Manuel Antonio está disponible para clases, talleres, retiros de día y eventos privados — un espacio tranquilo, natural y cuidado para que tu práctica florezca."
            : "Share your work in a setting made for wellbeing. Our studio in the heart of Manuel Antonio is available for classes, workshops, day retreats and private events — a calm, natural, cared-for space for your practice to flourish."}
        </motion.p>

        <div className="grid gap-8 md:grid-cols-2 mt-12">
          <motion.div {...fadeIn} className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4 text-spa-sage">
              <Sparkles className="h-5 w-5" />
              <h2 className="font-heading text-xl font-medium text-foreground">{es ? "Qué incluye" : "What's included"}</h2>
            </div>
            <ul className="space-y-2.5">
              {included.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 font-body text-sm text-foreground/80">
                  <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" /> {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...fadeIn} className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4 text-spa-sage">
              <Users className="h-5 w-5" />
              <h2 className="font-heading text-xl font-medium text-foreground">{es ? "Ideal para" : "Ideal for"}</h2>
            </div>
            <ul className="space-y-2.5">
              {idealFor.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 font-body text-sm text-foreground/80">
                  <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" /> {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div {...fadeIn} className="mt-12 rounded-2xl border border-border bg-spa-sage/5 p-8 text-center">
          <CalendarClock className="h-9 w-9 text-spa-sage mx-auto mb-3" />
          <h2 className="font-heading text-2xl font-medium text-foreground mb-2">
            {es ? "Consulta disponibilidad y tarifas" : "Ask about availability & rates"}
          </h2>
          <p className="spa-body max-w-lg mx-auto mb-6">
            {es
              ? "Cuéntanos sobre tu clase, taller o evento y coordinamos las fechas, el horario y la tarifa que mejor se ajusten a ti."
              : "Tell us about your class, workshop or event and we'll arrange the dates, timing and rate that work best for you."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="spa" size="lg">
              <Link to="/book?service=consultation&topic=Studio Rental Inquiry">
                {es ? "Solicitar información" : "Request information"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={HOLIS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </Button>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default StudioRentalPage;
