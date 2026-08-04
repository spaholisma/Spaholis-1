import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { CourseReviews } from "@/components/CourseReviews";

import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { useServices, type ServiceRow } from "@/hooks/useServices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslation } from "react-i18next";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const heroImg = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/e8d3d8e8-aeb6-4bf8-bd54-7accc0ec5b31/1.webp";
const massageImg = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/ea8a0bdc-2ef9-4308-b8a1-5020bdbfa905/holis+page+massage+therapy+%281%29.jpg";
const couplesImg = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/654ba82a-0efe-4483-9d74-b2bd4bf4c38d/EvolveJan16-scaled+%281%29.webp";

function useUserProgress(userId?: string) {
  return useQuery({
    queryKey: ["user-progress", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

/* ── SAS level keys (content lives in i18n locales) ── */
const sasLevelKeys = ["level1", "level2", "level3"] as const;

const EducationalPage = () => {
  const { t } = useTranslation();
  const { data: services, isLoading } = useServices();
  const { user } = useAuth();
  const { data: progress } = useUserProgress(user?.id);
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const edu = siteContent?.education || defaults.education;
  const seo = seoData || seoDefaults;
  const [enrollDialog, setEnrollDialog] = useState<ServiceRow | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });

  const allCourses = (services ?? []).filter((s) => s.type === "course");
  // The SAS training has its own section above ($600 per module). Every other
  // course appears in the Professional Modules list below it.
  const sasCourse = allCourses.find((s) => s.title.toLowerCase().includes("somato")) ?? null;
  const courses = allCourses.filter((s) => s.id !== sasCourse?.id);
  const workshops = (services ?? []).filter((s) => s.type === "workshop");

  const handleEnroll = async () => {
    if (!enrollDialog) return;
    const email = formData.email.trim();
    const phone = formData.phone.trim();
    if (!email || !phone) {
      toast.error("Please enter your email and phone number.");
      return;
    }
    try {
      const bookingData: any = {
        service_id: enrollDialog.id,
        booking_date: new Date().toISOString().slice(0, 10),
        booking_time: "00:00:00",
        guest_name: formData.name.trim() || email,
        guest_email: email,
        guest_phone: phone,
        // Capture what they're requesting so staff can follow up from the notes.
        notes: `Information request — ${enrollDialog.title}`,
        total_price: enrollDialog.price,
        status: "pending",
        user_id: user?.id || null,
      };
      await supabase.from("bookings").insert(bookingData);
      // Email the team so a course/training request isn't missed (info@ + backup).
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            request_kind: "info",
            service_name: enrollDialog.title,
            guest_name: formData.name.trim() || email,
            guest_email: email,
            guest_phone: phone,
            notes: `Information request — ${enrollDialog.title}`,
          },
        });
      } catch (_e) { /* non-fatal: the lead is already saved */ }
      toast.success("Request sent! Our team will contact you shortly.");
      setFormData({ name: "", email: "", phone: "" });
      setEnrollDialog(null);
    } catch (err: any) {
      toast.error(err.message || t("education.enrollmentFailed"));
    }
  };

  // Open the request form with empty fields so the client enters their own
  // details (never pre-fill the signed-in admin's email).
  const openRequest = (svc: ServiceRow) => {
    setFormData({ name: "", email: "", phone: "" });
    setEnrollDialog(svc);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.education.title} description={seo.education.description} canonical={seo.education.canonical} />
      <Navbar />

      {/* ── Hero Banner ── */}
      <div className="relative h-[50vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <img src={heroImg} alt="Educational Programs" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-foreground/50" />
        <div className="relative z-10 text-center px-4 max-w-3xl">
          <motion.h1 {...fadeIn} className="font-heading text-4xl md:text-5xl lg:text-6xl font-semibold text-background mb-4">
            {edu.heroTitle}
          </motion.h1>
          <motion.p {...fadeIn} className="font-body text-sm md:text-base text-background/90 mb-2">
            {edu.heroByline}
          </motion.p>
          <motion.p {...fadeIn} className="font-body text-sm md:text-base text-background/80 leading-relaxed max-w-2xl mx-auto">
            {edu.heroDescription}
          </motion.p>
        </div>
      </div>

      {isLoading ? (
        <div className="max-w-7xl mx-auto px-4 py-16">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* ── Somato Awareness System Section ── */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
              <motion.div {...fadeIn} className="rounded-2xl overflow-hidden">
                <img src={massageImg} alt="Somato Awareness System" className="w-full h-full object-cover" />
              </motion.div>
              <motion.div {...fadeIn} className="space-y-5">
                <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground">
                  {t("education.sasHeading")}
                </h2>
                <h3 className="font-heading text-xl md:text-2xl font-medium text-foreground/80">
                  {t("education.sasSubheading")}
                </h3>
                <p className="font-body text-sm text-muted-foreground italic">{t("education.createdBy")}</p>
                <p className="spa-body">{t("education.sasIntro1")}</p>
                <p className="spa-body">{t("education.sasIntro2")}</p>
                <p className="spa-body">{t("education.sasIntro3")}</p>
                <p className="spa-body">{t("education.sasIntro4")}</p>
                <div className="bg-muted rounded-xl p-5 space-y-1">
                  <p className="font-body text-sm text-foreground">{t("education.eachLevel")}</p>
                  <p className="font-body text-sm text-muted-foreground">{t("education.hoursDirect")}</p>
                  <p className="font-body text-sm text-muted-foreground">{t("education.hoursPractice")}</p>
                  <p className="font-body text-sm font-medium text-foreground mt-2">{t("education.totalLevel")}</p>
                  <p className="font-body text-xs text-muted-foreground mt-1">{t("education.practiceNote")}</p>
                </div>
              </motion.div>
            </div>

            {/* ── FECOPROBE Certification ── */}
            <motion.div {...fadeIn} className="max-w-3xl mx-auto mb-20">
              <div className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl bg-muted/40 border border-border p-6 sm:p-8">
                <img
                  src="/images/fecoprobe-certificacion.png"
                  alt="FECOPROBE Seal"
                  className="h-28 w-auto flex-shrink-0"
                />
                <div className="text-center sm:text-left">
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Official Certification
                  </p>
                  <h4 className="font-heading text-2xl font-semibold text-foreground">
                    FECOPROBE AEL-0964
                  </h4>
                  <p className="mt-2 font-body text-sm text-muted-foreground leading-relaxed">
                    Academic Elementary Membership Certification for the
                    Somato Awareness System™ educational program.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* ── Accordion Levels ── */}
            <Accordion type="single" collapsible className="space-y-4">
              {sasLevelKeys.map((key, idx) => {
                const learnItems = [1, 2, 3, 4, 5].map((i) => t(`education.sasLevels.${key}.learn${i}`));
                const practiceItems = [1, 2, 3, 4].map((i) => t(`education.sasLevels.${key}.practice${i}`));
                return (
                  <AccordionItem key={key} value={key} className="border border-border rounded-2xl overflow-hidden px-0">
                    <AccordionTrigger className="px-6 py-5 hover:no-underline">
                      <span className="font-heading text-lg md:text-xl font-medium text-foreground text-left">
                        {t(`education.sasLevels.${key}.title`)}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6">
                      <div className="space-y-6">
                        <div>
                          <h4 className="font-heading text-lg font-medium text-foreground mb-3">{t(`education.sasLevels.${key}.subtitle`)}</h4>
                          <p className="spa-body">{t(`education.sasLevels.${key}.intro`)}</p>
                        </div>

                        <div>
                          <h5 className="font-body text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("education.whatLearn")}</h5>
                          <ul className="space-y-1.5">
                            {learnItems.map((item, i) => (
                              <li key={i} className="font-body text-sm text-foreground/80 flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span> {item}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h5 className="font-body text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("education.whatPractice")}</h5>
                          <ol className="space-y-2">
                            {practiceItems.map((item, i) => (
                              <li key={i} className="font-body text-sm text-foreground/80 flex items-start gap-2">
                                <span className="font-semibold text-primary">{i + 1}.</span> {item}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="bg-muted rounded-xl p-4">
                          <h5 className="font-body text-sm font-semibold text-foreground mb-1">{t("education.result")}</h5>
                          <p className="font-body text-sm text-foreground/80">{t(`education.sasLevels.${key}.result`)}</p>
                        </div>

                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {sasCourse && (
              <motion.div {...fadeIn} className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6">
                <div>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-1">Investment</p>
                  <p className="font-heading text-2xl font-semibold text-foreground">{formatCRCWithUsd(sasCourse.price)} <span className="font-body text-sm font-normal text-muted-foreground">per module</span></p>
                </div>
                <Button variant="default" size="lg" onClick={() => openRequest(sasCourse)}>
                  {t("education.requestInfo", { defaultValue: "Request Information" })} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}
          </section>

          {/* ── Professional Modules (request format) ── */}
          {courses.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-20">
              <motion.div {...fadeIn} className="text-center max-w-2xl mx-auto mb-12">
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Continuing Education
                </p>
                <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-4">
                  Professional Modules
                </h2>
                <p className="spa-body">
                  Open to everyone — therapists, yoga teachers, bodyworkers, and anyone curious about the body's intelligence. No prior background required. Request information to join the next module.
                </p>
              </motion.div>
              <div className="grid grid-cols-1 gap-6">
                {courses.map((c) => (
                  <motion.div {...fadeIn} key={c.id} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                    <h3 className="font-heading text-xl font-medium text-foreground">{c.title}</h3>
                    {Number(c.duration_minutes) > 0 && (
                      <p className="font-body text-xs font-semibold uppercase tracking-wider text-spa-sage">
                        {Number(c.duration_minutes) % 60 === 0
                          ? `${Number(c.duration_minutes) / 60} hours`
                          : `${(Number(c.duration_minutes) / 60).toFixed(1)} hours`}
                      </p>
                    )}
                    <p className="spa-body-sm whitespace-pre-line flex-1">{c.description}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                      {Number(c.price) > 0 ? (
                        <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(c.price)}</span>
                      ) : (
                        <span className="font-body text-sm text-muted-foreground">By request</span>
                      )}
                      <Button variant="default" size="default" onClick={() => openRequest(c)}>
                        {t("education.requestInfo", { defaultValue: "Request Information" })} <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                    <CourseReviews serviceId={c.id} />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* ── Couple's & Connection Experience ── */}
          {workshops.length > 0 && (
            <section className="bg-muted/30">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                  <motion.div {...fadeIn} className="rounded-2xl overflow-hidden">
                    <img src={couplesImg} alt="Couple's & Connection Experience" className="w-full h-full object-cover" />
                  </motion.div>
                  <motion.div {...fadeIn} className="space-y-5">
                    <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground">
                      {t("education.couplesHeading")}
                    </h2>
                    <p className="spa-body">
                      {t("education.couplesIntro")}
                    </p>

                    {workshops.map((ws) => (
                      <div key={ws.id} className="bg-card border border-border rounded-xl p-6 space-y-3">
                        <h3 className="font-heading text-xl font-medium text-foreground">{ws.title}</h3>
                        <p className="spa-body-sm">{ws.description}</p>
                        <div className="flex items-center justify-between pt-2">
                          <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(ws.price)}</span>
                          <Button variant="default" size="default" onClick={() => openRequest(ws)}>
                            {t("education.requestInfo", { defaultValue: "Request Information" })} <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Enroll Dialog ── */}
      <Dialog open={!!enrollDialog} onOpenChange={() => setEnrollDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Request information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4">
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">{t("education.program")}</span>
                <span className="font-medium text-foreground">{enrollDialog?.title}</span>
              </div>
              {enrollDialog?.sessions && enrollDialog.sessions > 1 && (
                <div className="flex justify-between text-sm font-body mt-2">
                  <span className="text-muted-foreground">{t("education.sessions")}</span>
                  <span className="font-medium text-foreground">{enrollDialog.sessions}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-body mt-2 pt-2 border-t border-border">
                <span className="font-semibold text-foreground">{t("education.total")}</span>
                <span className="font-heading text-lg font-semibold text-foreground">
                  {enrollDialog && Number(enrollDialog.price) > 0 ? formatCRCWithUsd(enrollDialog.price) : "By request"}
                </span>
              </div>
            </div>
            <p className="font-body text-sm text-muted-foreground">
              Leave your details and our team will contact you with all the information about this training.
            </p>
            <Input placeholder={t("education.fullName", { defaultValue: "Full name" })} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Input placeholder={t("form.email", { defaultValue: "Email" })} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input placeholder="Phone / WhatsApp" type="tel" inputMode="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            {enrollDialog && (
              <Button
                className="w-full"
                disabled={!formData.email.trim() || !formData.phone.trim()}
                onClick={() => handleEnroll()}
              >
                {t("education.requestInfo", { defaultValue: "Request Information" })}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default EducationalPage;
