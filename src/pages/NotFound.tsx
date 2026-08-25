import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      {/*
        A Vite SPA on Vercel answers every path with HTTP 200, so an unknown url
        would otherwise look to Google like a thin duplicate of the homepage —
        exactly the "Soft 404" bucket in Search Console. `noindex` is Google's
        recommended remedy when a real 404 status can't be returned.
      */}
      <SEO
        title="Page not found"
        description="This page doesn't exist. Explore our treatments, classes and retreats at Holis Wellness Center in Manuel Antonio, Costa Rica."
        noindex
      />
      <div className="text-center max-w-md">
        <h1 className="mb-3 text-4xl font-heading font-bold text-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground font-body">
          Sorry, we couldn't find that page.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 font-body text-sm">
          <Link to="/" className="rounded-full bg-foreground px-4 py-2 text-background hover:opacity-90">
            Go to homepage
          </Link>
          <Link to="/treatments-therapies" className="text-primary underline hover:text-primary/80">
            Treatments
          </Link>
          <Link to="/classes" className="text-primary underline hover:text-primary/80">
            Classes
          </Link>
          <Link to="/retreats" className="text-primary underline hover:text-primary/80">
            Retreats
          </Link>
          <Link to="/book" className="text-primary underline hover:text-primary/80">
            Book now
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
