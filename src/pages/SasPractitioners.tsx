import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Globe2, Calendar, ShieldCheck, X } from "lucide-react";
import {
  getActivePractitioners,
  STATUS_LABELS,
  type Practitioner,
  type PractitionerStatus,
} from "@/data/practitioners";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const STATUS_ORDER: PractitionerStatus[] = [
  "certified",
  "senior",
  "instructor",
  "therapist",
  "graduate",
];

function PractitionerCard({ p, viewProfileLabel, bookLabel }: { p: Practitioner; viewProfileLabel: string; bookLabel: string }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="group bg-card rounded-2xl border border-border overflow-hidden flex flex-col hover:shadow-lg transition-shadow"
    >
      <Link to={`/practitioner/${p.slug}`} className="block aspect-[4/5] bg-muted overflow-hidden">
        {p.image ? (
          <img
            src={p.image}
            alt={`${p.name} — ${p.role}`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-spa-sage/10">
            <span className="font-heading text-5xl text-spa-sage/30">{p.name[0]}</span>
          </div>
        )}
      </Link>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {p.status.slice(0, 2).map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px] uppercase tracking-wider">
              {STATUS_LABELS[s]}
            </Badge>
          ))}
        </div>
        <h3 className="font-heading text-lg font-medium text-foreground">
          <Link to={`/practitioner/${p.slug}`} className="hover:text-primary transition-colors">
            {p.name}
          </Link>
        </h3>
        <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
          {p.role}
        </p>
        <div className="mt-3 space-y-1.5 text-xs font-body text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {p.city}, {p.country}
          </p>
          <p className="flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 shrink-0" />
            {p.languages.join(", ")}
          </p>
        </div>
        <p className="font-body text-sm text-foreground/80 mt-3 line-clamp-3 flex-1">{p.bio}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.specialties.slice(0, 3).map((s) => (
            <span
              key={s}
              className="text-[11px] font-body px-2 py-0.5 rounded-full bg-muted text-foreground/70"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to={`/practitioner/${p.slug}`}>{viewProfileLabel}</Link>
          </Button>
          {p.bookable && (
            <Button asChild size="sm" className="flex-1">
              <Link to={`/book?practitioner=${p.slug}`}>
                <Calendar className="h-3.5 w-3.5 mr-1.5" /> {bookLabel}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

const SasPractitionersPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.sasPractitioners || (defaults as any).sasPractitioners;
  const seoc = (seoData as any)?.sasPractitioners || (seoDefaults as any).sasPractitioners;
  const all = useMemo(() => getActivePractitioners(), []);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [specialty, setSpecialty] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PractitionerStatus | "all">("all");

  const countries = useMemo(
    () => Array.from(new Set(all.map((p) => p.country))).sort(),
    [all],
  );
  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          all
            .filter((p) => country === "all" || p.country === country)
            .map((p) => p.city),
        ),
      ).sort(),
    [all, country],
  );
  const specialties = useMemo(
    () => Array.from(new Set(all.flatMap((p) => p.specialties))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (statusFilter !== "all" && !p.status.includes(statusFilter)) return false;
      if (country !== "all" && p.country !== country) return false;
      if (city !== "all" && p.city !== city) return false;
      if (specialty !== "all" && !p.specialties.includes(specialty)) return false;
      if (!q) return true;
      const haystack = [
        p.name,
        p.role,
        p.country,
        p.city,
        ...p.specialties,
        ...p.languages,
        ...p.certifications,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [all, query, country, city, specialty, statusFilter]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SAS Certified Practitioners Directory",
    itemListElement: all.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://spaholis.com/practitioner/${p.slug}`,
      name: p.name,
    })),
  };

  const anyFilter = !!query || country !== "all" || city !== "all" || specialty !== "all" || statusFilter !== "all";
  const clearAll = () => {
    setQuery("");
    setCountry("all");
    setCity("all");
    setSpecialty("all");
    setStatusFilter("all");
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={seoc.title}
        description={seoc.description}
        canonical={seoc.canonical}
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <p className="inline-flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-3">
            <ShieldCheck className="h-4 w-4" /> {c.eyebrow}
          </p>
          <h1 className="spa-heading-xl text-foreground">{c.title}</h1>
          <p className="spa-body mt-4">{c.subtitle}</p>
          {c.registryNote && (
            <p className="mt-4 inline-flex items-start gap-2 text-left font-body text-sm text-muted-foreground bg-spa-sage/10 border border-spa-sage/20 rounded-full px-4 py-2">
              <ShieldCheck className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" /> {c.registryNote}
            </p>
          )}
        </motion.header>

        <div className="grid lg:grid-cols-[280px_1fr] gap-8 lg:gap-10 items-start">
          {/* Sidebar filters */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-heading text-base font-semibold text-foreground mb-3">{c.searchLabel}</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={c.searchPlaceholder}
                  className="pl-9"
                  aria-label="Search practitioners"
                />
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-base font-semibold text-foreground">{c.filtersLabel}</h3>
                {anyFilter && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex items-center gap-1 font-body text-xs text-spa-sage hover:underline"
                  >
                    <X className="h-3 w-3" /> {c.clearFilters}
                  </button>
                )}
              </div>
              <FilterSelect
                label={c.countryLabel}
                value={country}
                onChange={(v) => {
                  setCountry(v);
                  setCity("all");
                }}
                options={[{ value: "all", label: c.allCountries }, ...countries.map((ct) => ({ value: ct, label: ct }))]}
              />
              <FilterSelect
                label={c.cityLabel}
                value={city}
                onChange={setCity}
                options={[{ value: "all", label: c.allCities }, ...cities.map((ct) => ({ value: ct, label: ct }))]}
              />
              <FilterSelect
                label={c.specialtyLabel}
                value={specialty}
                onChange={setSpecialty}
                options={[{ value: "all", label: c.allSpecialties }, ...specialties.map((s) => ({ value: s, label: s }))]}
              />
              <FilterSelect
                label={c.statusLabel}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as PractitionerStatus | "all")}
                options={[
                  { value: "all", label: c.allStatuses },
                  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
                ]}
              />
            </div>
          </aside>

          {/* Results */}
          <div>
            <p className="font-body text-sm text-muted-foreground mb-6">
              {filtered.length} {filtered.length === 1 ? c.practitionerSingular : c.practitionerPlural}
              {statusFilter !== "all" && ` · ${STATUS_LABELS[statusFilter]}`}
            </p>

            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-2xl">
                <p className="font-body text-muted-foreground">{c.emptyText}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filtered.map((p) => (
                  <PractitionerCard key={p.slug} p={p} viewProfileLabel={c.viewProfileLabel} bookLabel={c.bookLabel} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SasPractitionersPage;
