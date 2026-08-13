import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { CourseReviews } from "@/components/CourseReviews";

import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";
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
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

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
  const [activeTab, setActiveTab] = useState<"sas" | "modules" | "couples">("sas");

  const allCourses = (services ?? []).filter((s) => s.type === "course");
  // The SAS training has its own section above ($600 per module). Every other
  // course appears in the Professional Modules list below it.
  const sasCourse = allCourses.find((s) => s.title.toLowerCase().includes("somato")) ?? null;
  const courses = allCourses.filter((s) => s.id !== sasCourse?.id);
  const workshops = (services ?? []).filter((s) => s.type === "workshop");

  // Category pills (bubbles) — only show a tab when it has content.
  const tabs: { id: "sas" | "modules" | "couples"; label: string }[] = [
    { id: "sas", label: edu.tabSas || "SAS Training" },
    ...(courses.length > 0 ? ([{ id: "modules", label: edu.tabModules || "Professional Modules" }] as const) : []),
    ...(workshops.length > 0 ? ([{ id: "couples", label: edu.tabCouples || "Couples & Connection" }] as const) : []),
  ];

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
        <img src={edu.heroImage} alt="Educational Programs" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-foreground/50" />
        <div className="relative z-10 text-center px-4 max-w-3xl">
          <motion.h1 {...cmsEditProps("education.heroTitle")} {...fadeIn} className="font-heading text-4xl md:text-5xl lg:text-6xl font-semibold text-background mb-4">
            {edu.heroTitle}
          </motion.h1>
          <motion.p {...cmsEditProps("education.heroByline")} {...fadeIn} className="font-body text-sm md:text-base text-background/90 mb-2">
            {edu.heroByline}
          </motion.p>
          <motion.p {...cmsEditProps("education.heroDescription")} {...fadeIn} className="font-body text-sm md:text-base text-background/80 leading-relaxed max-w-2xl mx-auto">
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
          {/* ── Category pills (bubbles) ── */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
            <motion.div {...fadeIn} className="flex flex-wrap gap-2 border-b border-border pb-4">
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setActiveTab(tb.id)}
                  className={cn(
                    "px-5 py-2.5 rounded-full font-body text-sm font-medium transition-all",
                    activeTab === tb.id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground",
                  )}
                >
                  {tb.label}
                </button>
              ))}
            </motion.div>
          </div>

          {/* ── Somato Awareness System Section ── */}
          {activeTab === "sas" && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
              <motion.div {...fadeIn} className="rounded-2xl overflow-hidden">
                <img {...cmsEditProps("education.somatoImage", "image")} src={edu.somatoImage} alt="Somato Awareness System" className="w-full h-full object-cover" />
              </motion.div>
              <motion.div {...fadeIn} className="space-y-5">
                <h2 {...cmsEditProps("education.sasHeading")} className="font-heading text-3xl md:text-4xl font-semibold text-foreground">
                  {edu.sasHeading}
                </h2>
                <h3 {...cmsEditProps("education.sasSubheading")} className="font-heading text-xl md:text-2xl font-medium text-foreground/80">
                  {edu.sasSubheading}
                </h3>
                <p {...cmsEditProps("education.createdBy")} className="font-body text-sm text-muted-foreground italic">{edu.createdBy}</p>
                <p {...cmsEditProps("education.sasIntro1")} className="spa-body">{edu.sasIntro1}</p>
                <p {...cmsEditProps("education.sasIntro2")} className="spa-body">{edu.sasIntro2}</p>
                <p {...cmsEditProps("education.sasIntro3")} className="spa-body">{edu.sasIntro3}</p>
                <p {...cmsEditProps("education.sasIntro4")} className="spa-body">{edu.sasIntro4}</p>
                <div className="bg-muted rounded-xl p-5 space-y-1">
                  <p className="font-body text-sm text-foreground">{edu.eachLevel}</p>
                  <p className="font-body text-sm text-muted-foreground">{edu.hoursDirect}</p>
                  <p className="font-body text-sm text-muted-foreground">{edu.hoursPractice}</p>
                  <p className="font-body text-sm font-medium text-foreground mt-2">{edu.totalLevel}</p>
                  <p className="font-body text-xs text-muted-foreground mt-1">{edu.practiceNote}</p>
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
                  <p {...cmsEditProps("education.fecoprobeEyebrow")} className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    {edu.fecoprobeEyebrow}
                  </p>
                  <h4 {...cmsEditProps("education.fecoprobeTitle")} className="font-heading text-2xl font-semibold text-foreground">
                    {edu.fecoprobeTitle}
                  </h4>
                  <p {...cmsEditProps("education.fecoprobeDescription")} className="mt-2 font-body text-sm text-muted-foreground leading-relaxed">
                    {edu.fecoprobeDescription}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* ── Accordion Levels ── */}
            <Accordion
              type="multiple"
              defaultValue={(edu.sasLevels ?? []).map((_: any, i: number) => `level${i + 1}`)}
              className="space-y-4"
            >
              {(edu.sasLevels ?? []).map((lvl: any, idx: number) => {
                const learnItems: string[] = Array.isArray(lvl.learn) ? lvl.learn : [];
                const practiceItems: string[] = Array.isArray(lvl.practice) ? lvl.practice : [];
                return (
                  <AccordionItem key={idx} value={`level${idx + 1}`} className="border border-border rounded-2xl overflow-hidden px-0">
                    <AccordionTrigger className="px-6 py-5 hover:no-underline">
                      <span {...cmsEditProps(`education.sasLevels.${idx}.title`)} className="font-heading text-lg md:text-xl font-medium text-foreground text-left">
                        {lvl.title}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6">
                      <div className="space-y-6">
                        <div>
                          <h4 {...cmsEditProps(`education.sasLevels.${idx}.subtitle`)} className="font-heading text-lg font-medium text-foreground mb-3">{lvl.subtitle}</h4>
                          <p {...cmsEditProps(`education.sasLevels.${idx}.intro`)} className="spa-body">{lvl.intro}</p>
                        </div>

                        <div>
                          <h5 className="font-body text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{edu.whatLearn}</h5>
                          <ul className="space-y-1.5">
                            {learnItems.map((item, i) => (
                              <li key={i} className="font-body text-sm text-foreground/80 flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span> <span {...cmsEditProps(`education.sasLevels.${idx}.learn.${i}`)}>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h5 className="font-body text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{edu.whatPractice}</h5>
                          <ol className="space-y-2">
                            {practiceItems.map((item, i) => (
                              <li key={i} className="font-body text-sm text-foreground/80 flex items-start gap-2">
                                <span className="font-semibold text-primary">{i + 1}.</span> <span {...cmsEditProps(`education.sasLevels.${idx}.practice.${i}`)}>{item}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="bg-muted rounded-xl p-4">
                          <h5 className="font-body text-sm font-semibold text-foreground mb-1">{edu.resultLabel}</h5>
                          <p {...cmsEditProps(`education.sasLevels.${idx}.result`)} className="font-body text-sm text-foreground/80">{lvl.result}</p>
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
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-1">{edu.investmentLabel}</p>
                  <p className="font-heading text-2xl font-semibold text-foreground">{formatCRCWithUsd(sasCourse.price)} <span className="font-body text-sm font-normal text-muted-foreground">{edu.perModule}</span></p>
                </div>
                <Button variant="default" size="lg" onClick={() => openRequest(sasCourse)}>
                  {edu.requestInfo} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}
          </section>
          )}

          {/* ── Professional Modules (request format) ── */}
          {activeTab === "modules" && courses.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20">
              <motion.div {...fadeIn} className="text-center max-w-2xl mx-auto mb-12">
                <p {...cmsEditProps("education.modulesEyebrow")} className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  {edu.modulesEyebrow}
                </p>
                <h2 {...cmsEditProps("education.modulesTitle")} className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-4">
                  {edu.modulesTitle}
                </h2>
                <p {...cmsEditProps("education.modulesSubtitle")} className="spa-body">
                  {edu.modulesSubtitle}
                </p>
              </motion.div>
              <Accordion type="multiple" defaultValue={courses.map((c) => c.id)} className="space-y-4">
                {courses.map((c) => (
                  <AccordionItem key={c.id} value={c.id} className="border border-border rounded-2xl overflow-hidden px-0 bg-card">
                    <AccordionTrigger className="px-6 py-5 hover:no-underline">
                      <div className="text-left">
                        <span className="font-heading text-lg md:text-xl font-medium text-foreground">{c.title}</span>
                        {Number(c.duration_minutes) > 0 && (
                          <span className="block font-body text-xs font-semibold uppercase tracking-wider text-spa-sage mt-1">
                            {Number(c.duration_minutes) % 60 === 0
                              ? `${Number(c.duration_minutes) / 60} hours`
                              : `${(Number(c.duration_minutes) / 60).toFixed(1)} hours`}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6">
                      <p className="spa-body-sm whitespace-pre-line">{c.description}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                        {Number(c.price) > 0 ? (
                          <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(c.price)}</span>
                        ) : (
                          <span className="font-body text-sm text-muted-foreground">{edu.byRequest}</span>
                        )}
                        <Button variant="default" size="default" onClick={() => openRequest(c)}>
                          {edu.requestInfo} <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                      <CourseReviews serviceId={c.id} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          {/* ── Couple's & Connection Experience ── */}
          {activeTab === "couples" && workshops.length > 0 && (
            <section className="bg-muted/30">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                  <motion.div {...fadeIn} className="rounded-2xl overflow-hidden">
                    <img {...cmsEditProps("education.couplesImage", "image")} src={edu.couplesImage} alt="Couple's & Connection Experience" className="w-full h-full object-cover" />
                  </motion.div>
                  <motion.div {...fadeIn} className="space-y-5">
                    <h2 {...cmsEditProps("education.couplesHeading")} className="font-heading text-3xl md:text-4xl font-semibold text-foreground">
                      {edu.couplesHeading}
                    </h2>
                    <p {...cmsEditProps("education.couplesIntro")} className="spa-body">
                      {edu.couplesIntro}
                    </p>

                    <Accordion type="multiple" defaultValue={workshops.map((ws) => ws.id)} className="space-y-4">
                      {workshops.map((ws) => (
                        <AccordionItem key={ws.id} value={ws.id} className="border border-border rounded-xl overflow-hidden px-0 bg-card">
                          <AccordionTrigger className="px-6 py-4 hover:no-underline">
                            <span className="font-heading text-lg md:text-xl font-medium text-foreground text-left">{ws.title}</span>
                          </AccordionTrigger>
                          <AccordionContent className="px-6 pb-6">
                            <p className="spa-body-sm">{ws.description}</p>
                            <div className="flex items-center justify-between pt-4">
                              <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(ws.price)}</span>
                              <Button variant="default" size="default" onClick={() => openRequest(ws)}>
                                {edu.requestInfo} <ChevronRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
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
            <DialogTitle className="font-heading">{edu.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-4">
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">{edu.dialogProgram}</span>
                <span className="font-medium text-foreground">{enrollDialog?.title}</span>
              </div>
              {enrollDialog?.sessions && enrollDialog.sessions > 1 && (
                <div className="flex justify-between text-sm font-body mt-2">
                  <span className="text-muted-foreground">{edu.dialogSessions}</span>
                  <span className="font-medium text-foreground">{enrollDialog.sessions}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-body mt-2 pt-2 border-t border-border">
                <span className="font-semibold text-foreground">{edu.dialogTotal}</span>
                <span className="font-heading text-lg font-semibold text-foreground">
                  {enrollDialog && Number(enrollDialog.price) > 0 ? formatCRCWithUsd(enrollDialog.price) : edu.byRequest}
                </span>
              </div>
            </div>
            <p className="font-body text-sm text-muted-foreground">
              {edu.dialogIntro}
            </p>
            <Input placeholder={edu.dialogFullName} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Input placeholder={t("form.email", { defaultValue: "Email" })} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input placeholder="Phone / WhatsApp" type="tel" inputMode="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            {enrollDialog && (
              <Button
                className="w-full"
                disabled={!formData.email.trim() || !formData.phone.trim()}
                onClick={() => handleEnroll()}
              >
                {edu.requestInfo}
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
