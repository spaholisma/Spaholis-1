import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WeeklyClassCalendar } from "@/components/WeeklyClassCalendar";
import { useWeekEvents } from "@/hooks/useClasses";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

const ClassesCalendarPage = () => {
  const { data: weekEvents, isLoading } = useWeekEvents();

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Class Schedule"
        description="See the weekly schedule of yoga, breathwork, meditation and wellness classes at Holis Wellness Center in Manuel Antonio, Costa Rica."
        canonical="/classes/schedule"
      />
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/classes"><ChevronLeft className="h-4 w-4 mr-1" /> Back to Events</Link>
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Weekly Schedule
          </p>
          <h1 className="spa-heading-xl text-foreground">Class Schedule</h1>
        </motion.div>

        {isLoading ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <WeeklyClassCalendar events={weekEvents ?? []} />
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ClassesCalendarPage;
