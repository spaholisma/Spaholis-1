import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Sun, Leaf, HandHeart, UtensilsCrossed } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const HERO = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/9482f2a2-2685-4fe6-a63d-c9a189520bd1/retreat-cover.jpg";

const DayRetreatsPage = () => {
  const { language } = useLanguage();
  const es = language === "es";

  const flow = es
    ? [
        { icon: Leaf, title: "Llegada y centrado", text: "Comienza con una bienvenida tranquila, respiración consciente y una intención para el día." },
        { icon: Sun, title: "Movimiento", text: "Yoga o movimiento consciente para despertar el cuerpo y calmar la mente." },
        { icon: HandHeart, title: "Tratamiento", text: "Un masaje o terapia holística personalizada para soltar y restaurar." },
        { icon: UtensilsCrossed, title: "Nutrir y descansar", text: "Un momento de nutrición consciente y descanso para integrar la experiencia." },
      ]
    : [
        { icon: Leaf, title: "Arrival & centering", text: "Begin with a calm welcome, mindful breathing and an intention for the day." },
        { icon: Sun, title: "Movement", text: "Yoga or conscious movement to awaken the body and settle the mind." },
        { icon: HandHeart, title: "Treatment", text: "A personalized massage or holistic therapy to release and restore." },
        { icon: UtensilsCrossed, title: "Nourish & rest", text: "A moment of mindful nourishment and rest to integrate the experience." },
      ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Day Retreats | Holis Wellness Center"
        description="A full day of wellness in Manuel Antonio — movement, holistic treatments, nourishment and rest, thoughtfully woven into one restorative day."
        canonical="/day-retreats"
      />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[380px] w-full overflow-hidden">
          <img src={HERO} alt="Day retreat at Holis" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {es ? "Retiros de día" : "Day Retreats"}
            </p>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {es ? "Un día entero para ti" : "A full day for yourself"}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.p {...fadeIn} className="spa-body text-lg leading-relaxed max-w-3xl">
          {es
            ? "Un retiro de día es una pausa completa: movimiento, tratamientos holísticos, nutrición y descanso, entrelazados en una experiencia restauradora en el corazón de Manuel Antonio. Perfecto para reconectar contigo mismo, en solitario o con quienes quieras compartirlo."
            : "A day retreat is a complete pause: movement, holistic treatments, nourishment and rest, woven into one restorative experience in the heart of Manuel Antonio. Perfect for reconnecting with yourself — solo or with those you'd love to share it with."}
        </motion.p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mt-12">
          {flow.map((step, i) => (
            <motion.div {...fadeIn} key={i} className="bg-card border border-border rounded-2xl p-6">
              <div className="w-11 h-11 rounded-full bg-spa-sage/15 flex items-center justify-center mb-4">
                <step.icon className="h-5 w-5 text-spa-sage" />
              </div>
              <h2 className="font-heading text-lg font-medium text-foreground mb-1.5">{step.title}</h2>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeIn} className="mt-12 rounded-2xl border border-border bg-spa-sage/5 p-8 text-center">
          <h2 className="font-heading text-2xl font-medium text-foreground mb-2">
            {es ? "Diseña tu día de bienestar" : "Design your wellness day"}
          </h2>
          <p className="spa-body max-w-lg mx-auto mb-6">
            {es
              ? "Cada retiro de día se adapta a ti. Cuéntanos qué buscas y crearemos una experiencia a tu medida."
              : "Every day retreat is tailored to you. Tell us what you're looking for and we'll craft an experience just for you."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="spa" size="lg">
              <Link to="/custom-retreat">{es ? "Planear mi día" : "Plan my day"}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/retreats?tab=experiences">{es ? "Ver experiencias" : "Explore experiences"}</Link>
            </Button>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default DayRetreatsPage;
