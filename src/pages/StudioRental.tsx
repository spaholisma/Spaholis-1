import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageProvider";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HERO = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/e8d3d8e8-aeb6-4bf8-bd54-7accc0ec5b31/1.webp";
const STUDIO_IMG = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/ea8a0bdc-2ef9-4308-b8a1-5020bdbfa905/holis+page+massage+therapy+%281%29.jpg";

const StudioRentalPage = () => {
  const { language } = useLanguage();
  const es = language === "es";

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    eventType: "", props: "", day: "", time: "", hours: "", details: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const features = es
    ? ["Espacio para hasta 15 personas", "Aire acondicionado", "Mats, bloques y correas", "Equipo aéreo (9 columpios)", "Torre GYROTONIC®", "Banquitos GYROKINESIS®", "Vista al mar", "Sistema de sonido", "Refrigerador con toallas frías"]
    : ["Space for up to 15 people", "Air conditioning", "Mats, blocks, and straps", "Aerial equipment (9 swings)", "GYROTONIC® Tower", "GYROKINESIS® stools", "Ocean view", "Sound system", "Fridge with cold towels"];

  const rates = es
    ? [["$45", "1 hora"], ["$62", "1.5 horas"], ["$79", "2 horas"], ["$170", "medio día (6 horas)"], ["$226", "día completo (10 horas)"]]
    : [["$45", "1 hour"], ["$62", "1.5 hours"], ["$79", "2 hours"], ["$170", "half day (6 hours)"], ["$226", "the full day (10 hours)"]];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const req = [form.firstName, form.lastName, form.email, form.phone, form.eventType, form.props, form.day, form.time, form.hours];
    if (req.some((v) => !v.trim())) {
      toast.error(es ? "Completa todos los campos obligatorios." : "Please complete all required fields.");
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error(es ? "Ingresa un correo válido." : "Please enter a valid email.");
      return;
    }
    setSubmitting(true);
    const notes = [
      `Studio Rental Inquiry`,
      `Event/class: ${form.eventType.trim()}`,
      `Props needed: ${form.props.trim()}`,
      `Preferred day/time: ${form.day} ${form.time} (Central Time)`,
      `Hours requested: ${form.hours.trim()}`,
      form.details.trim() ? `Notes: ${form.details.trim()}` : "",
    ].filter(Boolean).join(" — ");
    try {
      await supabase.from("bookings").insert({
        guest_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        guest_email: form.email.trim(),
        guest_phone: form.phone.trim() || null,
        booking_date: form.day || new Date().toISOString().split("T")[0],
        booking_time: form.time || "00:00",
        status: "pending",
        notes,
      });
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            request_kind: "info",
            service_name: "Studio Rental Inquiry",
            guest_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
            guest_email: form.email.trim(),
            guest_phone: form.phone.trim(),
            notes,
            booking_date: new Date().toLocaleDateString(),
          },
        });
      } catch { /* non-critical */ }
      setSubmitted(true);
    } catch {
      toast.error(es ? "Algo salió mal. Intenta de nuevo." : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Studio Rental | Holis Wellness Center"
        description="Rent our fully-equipped yoga studio in Manuel Antonio — aerial rig, GYROTONIC® tower, ocean view and more. Hourly, half-day and full-day rates."
        canonical="/studio-rental"
      />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[380px] w-full overflow-hidden">
          <img src={HERO} alt="Holis yoga studio" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-foreground/30" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pt-16">
          <motion.h1 {...fadeIn} className="spa-heading-xl text-spa-cream drop-shadow-lg text-center px-4">
            {es ? "Alquila el estudio" : "Rent the Studio"}
          </motion.h1>
        </div>
      </div>

      {/* Studio + your event */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.h2 {...fadeIn} className="font-heading text-3xl md:text-4xl font-semibold text-foreground text-center mb-12">
          {es ? "Nuestro estudio — ¡tu evento!" : "Our studio — your event!"}
        </motion.h2>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          <motion.div {...fadeIn} className="space-y-5">
            <p className="spa-body">
              {es
                ? "¿Eres profesor y buscas ofrecer clases en el hermoso Manuel Antonio, o simplemente un lugar cómodo para continuar tu práctica personal?"
                : "Are you a teacher looking to offer classes in beautiful Manuel Antonio, or simply seeking a comfortable place to continue your personal practice?"}
            </p>
            <p className="spa-body">
              {es
                ? "Con gusto te ofrecemos nuestro estudio de yoga totalmente equipado para alquiler. Nuestro espacio sereno y bien acondicionado es perfecto para impartir clases o para uso personal, garantizando un ambiente tranquilo e inspirador para todo lo que necesites."
                : "We are delighted to offer you our fully equipped yoga studio for rent. Our serene and well-appointed space is perfect for hosting classes or for personal use, ensuring a tranquil and inspiring environment for all your needs."}
            </p>

            <div>
              <h3 className="font-heading text-xl font-semibold text-foreground mt-6 mb-3">{es ? "Características:" : "Features:"}</h3>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 font-body text-sm text-foreground/85">
                    <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-heading text-xl font-semibold text-foreground mt-6 mb-3">{es ? "Tarifas:" : "Rates:"}</h3>
              <ul className="space-y-1.5">
                {rates.map(([price, unit], i) => (
                  <li key={i} className="font-body text-sm text-foreground/85">
                    <span className="font-heading font-semibold text-foreground">{price}</span> {es ? "por" : "for"} <span className="font-medium">{unit}</span>
                  </li>
                ))}
              </ul>
              <p className="font-body text-xs text-muted-foreground mt-2">{es ? "Todas las tarifas en USD." : "All rates in USD."}</p>
            </div>
          </motion.div>

          <motion.div {...fadeIn} className="rounded-2xl overflow-hidden md:sticky md:top-24">
            <img src={STUDIO_IMG} alt="Yoga studio rent Manuel Antonio" className="w-full h-full object-cover" loading="lazy" />
          </motion.div>
        </div>
      </section>

      {/* Inquiry */}
      <section className="bg-spa-sage/8 border-t border-spa-sage/20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <motion.div {...fadeIn} className="text-center mb-10">
            <h2 className="font-heading text-2xl md:text-3xl font-semibold text-foreground leading-tight">
              {es ? "No vemos la hora de recibirte." : "We can't wait to host you."}<br />
              {es ? "¿Te interesa alquilar el estudio de yoga?" : "Interested in renting the yoga studio?"}
            </h2>
            <p className="spa-body mt-3">
              {es ? "Déjanos tus datos y te contactaremos pronto. ¡Esperamos saber de ti!" : "Fill out some info and we'll be in touch shortly. We can't wait to hear from you!"}
            </p>
          </motion.div>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-card border border-border rounded-2xl p-10">
              <div className="w-14 h-14 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-5">
                <Check className="h-7 w-7 text-spa-sage" />
              </div>
              <h3 className="spa-heading-md text-foreground mb-2">{es ? "¡Gracias!" : "Thank you!"}</h3>
              <p className="spa-body text-muted-foreground max-w-sm mx-auto">
                {es ? "Recibimos tu solicitud. Nuestro equipo te contactará muy pronto para coordinar los detalles del alquiler." : "We've received your request. Our team will reach out very soon to arrange the details of your rental."}
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "Nombre" : "First Name"} *</Label>
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} maxLength={80} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "Apellido" : "Last Name"} *</Label>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} maxLength={80} required />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "Correo" : "Email"} *</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={255} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "Teléfono" : "Phone"} *</Label>
                  <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{es ? "¿Qué tipo de evento / clase te gustaría realizar?" : "What type of event / class would you like to host?"} *</Label>
                <Textarea value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className="min-h-[80px]" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{es ? "¿Qué props necesitarás?" : "What kind of props will you need?"} *</Label>
                <Input value={form.props} onChange={(e) => set("props", e.target.value)} maxLength={200} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "¿Qué día quieres reservar el estudio?" : "What day would you like to book the studio?"} *</Label>
                  <Input type="date" value={form.day} min={new Date().toISOString().split("T")[0]} onChange={(e) => set("day", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{es ? "¿A qué hora? (hora Central)" : "At what time? (Central Time)"} *</Label>
                  <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{es ? "¿Cuántas horas quieres reservar? (solo número)" : "How many hours would you like to book? (# only)"} *</Label>
                <Input type="number" min="1" step="0.5" value={form.hours} onChange={(e) => set("hours", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{es ? "¿Algún otro detalle o pregunta?" : "Any other details or questions?"}</Label>
                <Textarea value={form.details} onChange={(e) => set("details", e.target.value)} className="min-h-[80px]" />
              </div>
              <Button type="submit" variant="spa" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (es ? "Enviando…" : "Sending…") : (es ? "Enviar" : "Send")}
              </Button>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default StudioRentalPage;
