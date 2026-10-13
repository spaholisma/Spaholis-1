import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { PassChooser } from "@/components/PassChooser";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";
import { ShoppingBag, ArrowLeft } from "lucide-react";

/**
 * Passes and memberships, on a page of their own.
 *
 * Every pass is Holis Wellness Center's (2026-10: the teachers chose not to sell
 * their own): pick one and pay Holis online — no teacher to choose, it works
 * on every weekly class.
 * The old /classes#buy link and the /buy, /passes and /memberships routes all
 * land here.
 */
export default function MembershipsPage() {
  const { data: siteContent } = useSiteContent();
  const cls = (siteContent?.classes || defaults.classes) as any;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Class Passes & Memberships | Holis Wellness Center"
        description="Class passes and monthly memberships for yoga and movement classes at Holis Wellness Center in Manuel Antonio, Costa Rica."
        canonical="https://www.spaholis.com/memberships"
      />
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3 text-spa-sage">
              <ShoppingBag className="h-4 w-4" />
              <p {...cmsEditProps("classes.purchaseEyebrow")}
                className="font-body text-xs font-semibold uppercase tracking-[0.2em]">
                {cls.purchaseEyebrow}
              </p>
            </div>
            <h1 {...cmsEditProps("classes.membershipsTitle")} className="spa-heading-lg text-foreground">
              {cls.membershipsTitle}
            </h1>
            <p {...cmsEditProps("classes.membershipsSubtitle")} className="spa-body mt-3 max-w-xl mx-auto">
              {cls.membershipsSubtitle}
            </p>
            <Link
              to="/classes"
              className="inline-flex items-center gap-1 mt-4 font-body text-sm font-semibold text-spa-sage hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to classes
            </Link>
          </div>

          {/* The studio's passes: buy one straight away, paid to Holis. */}
          <PassChooser />

          <p className="spa-body-sm text-center mt-10 max-w-xl mx-auto">
            Passes and memberships are paid online to Holis Wellness Center and work on every weekly class.{" "}
            <Link to="/classes/schedule" className="text-primary hover:underline">See the class schedule</Link>.
          </p>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
