import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { RichText } from "@/components/ui/rich-text";
import { cmsEditProps } from "@/lib/cmsEdit";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fade = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

interface TeamMember {
  name: string;
  role: string;
  bio: string;
  image: string;
}

function TeamCard({ member }: { member: TeamMember }) {
  return (
    <motion.div {...fade} className="group">
      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted mb-4">
        {member.image ? (
          <img
            src={member.image}
            alt={member.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-spa-sage/10">
            <span className="font-heading text-4xl text-spa-sage/30">{member.name[0]}</span>
          </div>
        )}
      </div>
      <h3 className="font-heading text-lg font-medium text-foreground">{member.name}</h3>
      <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
        {member.role}
      </p>
      <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed">
        <RichText value={member.bio} />
      </p>
    </motion.div>
  );
}

const AboutPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const about = siteContent?.about || defaults.about;
  const seo = seoData || seoDefaults;

  const therapists: TeamMember[] = (about as any).therapists || defaults.about.therapists;
  const instructors: TeamMember[] = (about as any).instructors || defaults.about.instructors;
  const management: TeamMember[] = (about as any).management || defaults.about.management;
  const founderBio: string[] = (about as any).founderBio || defaults.about.founderBio;
  const founderSections: { title: string; text: string }[] = (about as any).founderSections || defaults.about.founderSections;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.about.title} description={seo.about.description} canonical={seo.about.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] overflow-hidden">
        {(about as any).heroImage && (
          <img
            src={(about as any).heroImage}
            alt={(about as any).heroImageAlt || "About Holis"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12">
          <motion.p {...fade} className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-white/80 mb-3">
            {about.heroEyebrow}
          </motion.p>
          <motion.h1 {...fade} className="font-heading text-4xl sm:text-5xl lg:text-6xl font-light text-white max-w-2xl">
            {about.heroTitle}
          </motion.h1>
        </div>
      </section>

      {/* Brand Philosophy */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-20">
        <motion.div {...fade} className="space-y-6 text-center">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {about.brandEyebrow}
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground leading-tight">
            {about.brandTitle}
          </h2>
          {about.brandParagraphs.map((p: string, i: number) => (
            <p key={i} className="font-body text-base text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              <RichText value={p} path={`about.brandParagraphs.${i}`} />
            </p>
          ))}
        </motion.div>
      </section>

      {/* Evelina Featured Profile */}
      <section className="bg-card border-y border-border">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
          <motion.div {...fade} className="grid md:grid-cols-[280px_1fr] gap-12 items-start max-w-5xl mx-auto">
            <div className="aspect-[3/4] rounded-2xl overflow-hidden">
              {(about as any).founderImage && (
                <img
                  {...cmsEditProps("about.founderImage", "image")}
                  src={(about as any).founderImage}
                  alt={(about as any).founderImageAlt || about.founderName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="space-y-6">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">
                {about.founderEyebrow}
              </p>
              <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">
                {about.founderName}
              </h2>
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {about.founderRole}
              </p>

              <div className="space-y-5 font-body text-base text-muted-foreground leading-relaxed">
                {founderBio.map((p, i) => (
                  <p key={i}><RichText value={p} /></p>
                ))}

                {founderSections.map((section, i) => (
                  <div key={i}>
                    <h3 className="font-heading text-xl font-medium text-foreground !mt-8">
                      {section.title}
                    </h3>
                    <p>{section.text}</p>
                  </div>
                ))}
              </div>

              <blockquote className="border-l-2 border-spa-sage pl-6 mt-8">
                <p className="font-body text-base italic text-foreground leading-relaxed">
                  "{about.founderQuote}"
                </p>
                <footer className="mt-3 font-body text-sm text-muted-foreground">
                  — {about.founderQuoteAttribution}
                </footer>
              </blockquote>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Massage & Spa Therapists */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
        <motion.div {...fade} className="text-center mb-14">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {about.therapistsEyebrow}
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">
            {about.therapistsTitle}
          </h2>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-10">
          {therapists.map((m, i) => (
            <TeamCard key={`therapist-${i}`} member={m} />
          ))}
        </div>
      </section>

      {/* Yoga & Movement Instructors */}
      <section className="bg-card border-y border-border">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
          <motion.div {...fade} className="text-center mb-14">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {about.instructorsEyebrow}
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">
              {about.instructorsTitle}
            </h2>
          </motion.div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
            {instructors.map((m, i) => (
              <TeamCard key={`instructor-${i}`} member={m} />
            ))}
          </div>
        </div>
      </section>

      {/* Management & Reception */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
        <motion.div {...fade} className="text-center mb-14">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {about.managementEyebrow}
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">
            {about.managementTitle}
          </h2>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-10 max-w-2xl mx-auto">
          {management.map((m, i) => (
            <TeamCard key={`mgmt-${i}`} member={m} />
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutPage;
