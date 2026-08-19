import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  type?: "website" | "article";
  image?: string;
  jsonLd?: Record<string, unknown>;
}

const SITE_NAME = "Holis Wellness Center";
const BASE_URL = "https://www.spaholis.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/images/social-share.jpg`;

export function SEO({ title, description, canonical, type = "website", image, jsonLd }: SEOProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : undefined;

  useEffect(() => {
    document.title = fullTitle;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("description", description);
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", type, "property");
    const ogImage = image
      ? (image.startsWith("http") ? image : `${BASE_URL}${image}`)
      : DEFAULT_OG_IMAGE;
    setMeta("og:image", ogImage, "property");
    setMeta("twitter:image", ogImage, "name");
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", fullTitle, "name");
    setMeta("twitter:description", description, "name");

    if (canonicalUrl) {
      setMeta("og:url", canonicalUrl, "property");
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonicalUrl);
    }

    // JSON-LD
    const existingLd = document.querySelector('script[data-seo-jsonld]');
    if (existingLd) existingLd.remove();

    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo-jsonld", "true");
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      const ld = document.querySelector('script[data-seo-jsonld]');
      if (ld) ld.remove();
    };
  }, [fullTitle, description, canonicalUrl, type, jsonLd]);

  return null;
}

// Reusable JSON-LD schemas
export const businessJsonLd = {
  "@context": "https://schema.org",
  "@type": "HealthAndBeautyBusiness",
  name: "Holis Wellness Center",
  description: "Holistic treatments, yoga, breathwork, wellness experiences & retreats in Manuel Antonio, Costa Rica.",
  url: BASE_URL,
  telephone: "",
  email: "spaholisma@gmail.com",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Manuel Antonio",
    addressRegion: "Quepos",
    addressCountry: "CR",
  },
  priceRange: "$$",
};
