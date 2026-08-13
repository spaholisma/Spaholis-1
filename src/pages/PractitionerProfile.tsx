import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  MapPin,
  Globe2,
  Calendar,
  Award,
  Sparkles,
  Mail,
  ExternalLink,
} from "lucide-react";
import { STATUS_LABELS } from "@/data/practitioners";
import { usePractitioners } from "@/hooks/usePractitioners";

const PractitionerProfilePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: all, isLoading } = usePractitioners();
  const p = slug ? (all ?? []).find((x) => x.slug === slug && x.isActive !== false) : undefined;

  if (!p) {
    // Still loading the directory — don't flash the "not found" screen.
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background">
          <Navbar />
          <main className="pt-28 pb-16 px-4 max-w-2xl mx-auto text-center">
            <p className="spa-body text-muted-foreground">Loading…</p>
          </main>
          <Footer />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <SEO
          title="Practitioner Not Found"
          description="This practitioner profile is not available."
          canonical={`/practitioner/${slug ?? ""}`}
        />
        <Navbar />
        <main className="pt-28 pb-16 px-4 max-w-2xl mx-auto text-center">
          <h1 className="spa-heading-lg text-foreground mb-4">Practitioner not found</h1>
          <p className="spa-body mb-8">This profile may no longer be available.</p>
          <Button asChild>
            <Link to="/sas-practitioners">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to directory
            </Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    jobTitle: p.role,
    image: p.image,
    description: p.bio,
    knowsLanguage: p.languages,
    address: {
      "@type": "PostalAddress",
      addressLocality: p.city,
      addressCountry: p.country,
    },
    hasCredential: p.certifications.map((c) => ({
      "@type": "EducationalOccupationalCredential",
      name: c,
    })),
    knowsAbout: p.specialties,
    worksFor: {
      "@type": "Organization",
      name: "Somato Awareness System (SAS) — Holis Wellness Center",
      url: "https://spaholis.com",
    },
    url: `https://spaholis.com/practitioner/${p.slug}`,
  };

  const description = `${p.name} — ${p.role} in ${p.city}, ${p.country}. ${p.bio}`.slice(0, 160);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${p.name} — ${p.role}`}
        description={description}
        canonical={`/practitioner/${p.slug}`}
        type="article"
        image={p.image}
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <Link
          to="/sas-practitioners"
          className="inline-flex items-center gap-1.5 text-sm font-body text-muted-foreground hover:text-foreground mb-8"
        >
          <ChevronLeft className="h-4 w-4" /> All practitioners
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_2fr] gap-10"
        >
          {/* Photo */}
          <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
            {p.image ? (
              <img src={p.image} alt={`${p.name} — ${p.role}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-spa-sage/10">
                <span className="font-heading text-6xl text-spa-sage/30">{p.name[0]}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {p.status.map((s) => (
                <Badge key={s} className="text-[10px] uppercase tracking-wider">
                  {STATUS_LABELS[s]}
                </Badge>
              ))}
            </div>
            <h1 className="spa-heading-lg text-foreground">{p.name}</h1>
            <p className="font-body text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-1">
              {p.role}
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-body text-muted-foreground">
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {p.city}, {p.country}
              </p>
              <p className="flex items-center gap-2">
                <Globe2 className="h-4 w-4" /> {p.languages.join(", ")}
              </p>
              {p.yearsExperience && (
                <p className="flex items-center gap-2">
                  <Award className="h-4 w-4" /> {p.yearsExperience}+ years experience
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {p.bookable && (
                <Button asChild>
                  <Link to={`/book?practitioner=${p.slug}`}>
                    <Calendar className="h-4 w-4 mr-1.5" /> Book a session
                  </Link>
                </Button>
              )}
              {p.email && (
                <Button asChild variant="outline">
                  <a href={`mailto:${p.email}`}>
                    <Mail className="h-4 w-4 mr-1.5" /> Email
                  </a>
                </Button>
              )}
              {p.website && (
                <Button asChild variant="outline">
                  <a href={p.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" /> Website
                  </a>
                </Button>
              )}
            </div>

            <section className="mt-10">
              <h2 className="font-heading text-xl font-medium text-foreground mb-3">Biography</h2>
              <p className="spa-body whitespace-pre-line">{p.bio}</p>
            </section>

            <section className="mt-8">
              <h2 className="font-heading text-xl font-medium text-foreground mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-spa-sage" /> Specialties
              </h2>
              <div className="flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <span
                    key={s}
                    className="text-xs font-body px-3 py-1 rounded-full bg-muted text-foreground/80"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-heading text-xl font-medium text-foreground mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-spa-sage" /> Certifications
              </h2>
              <ul className="space-y-1.5">
                {p.certifications.map((c) => (
                  <li key={c} className="font-body text-sm text-foreground/80 flex items-start gap-2">
                    <span className="text-spa-sage mt-0.5">✓</span> {c}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default PractitionerProfilePage;
