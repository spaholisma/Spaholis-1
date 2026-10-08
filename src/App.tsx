import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PartnerRedirect from "./pages/PartnerRedirect";
// Pages load when first visited, so opening the site doesn't download and run
// the whole Admin Panel and every booking form first (it was one 3 MB file).
// The home page and the QR links (/go/...) stay in the first download.
const pages = {
  About: () => import("./pages/About"),
  SignatureTreatments: () => import("./pages/SignatureTreatments"),
  Services: () => import("./pages/Services"),
  Booking: () => import("./pages/Booking"),
  BookingReturn: () => import("./pages/BookingReturn"),
  Classes: () => import("./pages/Classes"),
  ClassesCalendar: () => import("./pages/ClassesCalendar"),
  ClassDetail: () => import("./pages/ClassDetail"),
  MembershipsPage: () => import("./pages/Memberships"),
  PrivateClasses: () => import("./pages/PrivateClasses"),
  ClassBooking: () => import("./pages/ClassBooking"),
  Educational: () => import("./pages/Educational"),
  GiftCards: () => import("./pages/GiftCards"),
  Auth: () => import("./pages/Auth"),
  AdminDashboard: () => import("./pages/AdminDashboard"),
  TeacherPanel: () => import("./pages/TeacherPanel"),
  CardAuthorizationArchive: () => import("./pages/CardAuthorizationArchive"),
  ClientDashboard: () => import("./pages/ClientDashboard"),
  ResetPassword: () => import("./pages/ResetPassword"),
  Retreats: () => import("./pages/Retreats"),
  RetreatDetail: () => import("./pages/RetreatDetail"),
  CustomRetreat: () => import("./pages/CustomRetreat"),
  ExperienceBooking: () => import("./pages/ExperienceBooking"),
  Blog: () => import("./pages/Blog"),
  BlogPost: () => import("./pages/BlogPost"),
  Faqs: () => import("./pages/Faqs"),
  Contact: () => import("./pages/Contact"),
  StudioRental: () => import("./pages/StudioRental"),
  DayRetreats: () => import("./pages/DayRetreats"),
  WellnessPrograms: () => import("./pages/WellnessPrograms"),
  CranioSacral: () => import("./pages/CranioSacral"),
  Gyrotonic: () => import("./pages/Gyrotonic"),
  Kinesiology: () => import("./pages/Kinesiology"),
  Terms: () => import("./pages/Terms"),
  Privacy: () => import("./pages/Privacy"),
  Refund: () => import("./pages/Refund"),
  SasPractitioners: () => import("./pages/SasPractitioners"),
  PractitionerProfile: () => import("./pages/PractitionerProfile"),
  TestPayment: () => import("./pages/TestPayment"),
  TestPaymentReturn: () => import("./pages/TestPaymentReturn"),
};
const About = lazy(pages.About);
const SignatureTreatments = lazy(pages.SignatureTreatments);
const Services = lazy(pages.Services);
const Booking = lazy(pages.Booking);
const BookingReturn = lazy(pages.BookingReturn);
const Classes = lazy(pages.Classes);
const ClassesCalendar = lazy(pages.ClassesCalendar);
const ClassDetail = lazy(pages.ClassDetail);
const MembershipsPage = lazy(pages.MembershipsPage);
const PrivateClasses = lazy(pages.PrivateClasses);
const ClassBooking = lazy(pages.ClassBooking);
const Educational = lazy(pages.Educational);
const GiftCards = lazy(pages.GiftCards);
const Auth = lazy(pages.Auth);
const AdminDashboard = lazy(pages.AdminDashboard);
const TeacherPanel = lazy(pages.TeacherPanel);
const CardAuthorizationArchive = lazy(pages.CardAuthorizationArchive);
const ClientDashboard = lazy(pages.ClientDashboard);
const ResetPassword = lazy(pages.ResetPassword);
const Retreats = lazy(pages.Retreats);
const RetreatDetail = lazy(pages.RetreatDetail);
const CustomRetreat = lazy(pages.CustomRetreat);
const ExperienceBooking = lazy(pages.ExperienceBooking);
const Blog = lazy(pages.Blog);
const BlogPost = lazy(pages.BlogPost);
const Faqs = lazy(pages.Faqs);
const Contact = lazy(pages.Contact);
const StudioRental = lazy(pages.StudioRental);
const DayRetreats = lazy(pages.DayRetreats);
const WellnessPrograms = lazy(pages.WellnessPrograms);
const CranioSacral = lazy(pages.CranioSacral);
const Gyrotonic = lazy(pages.Gyrotonic);
const Kinesiology = lazy(pages.Kinesiology);
const Terms = lazy(pages.Terms);
const Privacy = lazy(pages.Privacy);
const Refund = lazy(pages.Refund);
const SasPractitioners = lazy(pages.SasPractitioners);
const PractitionerProfile = lazy(pages.PractitionerProfile);
const TestPayment = lazy(pages.TestPayment);
const TestPaymentReturn = lazy(pages.TestPaymentReturn);

// Once the page is showing and the browser is idle, fetch the public pages in
// the background, so moving around the site stays instant. The Admin, the
// account and test pages are left to load when they are opened.
const PUBLIC_PAGES = (Object.keys(pages) as (keyof typeof pages)[]).filter(
  (k) => !["AdminDashboard", "Auth", "BookingReturn", "CardAuthorizationArchive", "ClientDashboard", "ResetPassword", "TestPayment", "TestPaymentReturn", "TeacherPanel"].includes(k),
);
function PrefetchPages() {
  useEffect(() => {
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500);
    const t = window.setTimeout(() => idle(() => PUBLIC_PAGES.forEach((k) => pages[k]().catch(() => {}))), 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

// Shown for the moment a page's code is still arriving: the page background,
// so there is no flash.
const PageFallback = () => <div className="min-h-screen bg-background" aria-busy="true" />;

import { WhatsAppButton } from "./components/WhatsAppButton";
import { PromoPopup } from "./components/PromoPopup";
import { ScrollToTop } from "./components/ScrollToTop";
import { AnalyticsTracker } from "./components/AnalyticsTracker";
import { ConsentBanner } from "./components/ConsentBanner";
import { PreviewEditBridge } from "./components/PreviewEditBridge";
import { ThemeApplier } from "./components/ThemeApplier";
const queryClient = new QueryClient();

// Redirect that preserves search params and hash so links like /booking?service=...
// don't lose their query strings on the way to /book.
const RedirectPreserve = ({ to }: { to: string }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
};

// Route definitions are listed once and rendered twice:
// 1. at root for English (e.g. /book)
// 2. under /es/* for Spanish (e.g. /es/book)
// Language is resolved from the URL prefix by LanguageProvider.
const routeDefs: { path: string; element: React.ReactNode }[] = [
  { path: "/", element: <Index /> },
  { path: "/about", element: <About /> },
  { path: "/wellness", element: <Navigate to="/#wellness" replace /> },
  { path: "/treatments-therapies", element: <Services /> },
  { path: "/treatments-therapies/:category", element: <Services /> },
  { path: "/signature-treatments", element: <SignatureTreatments /> },
  { path: "/book", element: <Booking /> },
  { path: "/booking/return", element: <BookingReturn /> },
  { path: "/classes", element: <Classes /> },
  { path: "/classes/schedule", element: <ClassesCalendar /> },
  { path: "/classes/:classId", element: <ClassDetail /> },
  { path: "/private-sessions", element: <PrivateClasses /> },
  { path: "/class-booking", element: <ClassBooking /> },
  { path: "/education", element: <Educational /> },
  { path: "/gift-cards", element: <GiftCards /> },
  { path: "/retreats", element: <Retreats /> },
  { path: "/retreats/:slug", element: <RetreatDetail /> },
  { path: "/custom-retreat", element: <CustomRetreat /> },
  { path: "/day-retreats", element: <DayRetreats /> },
  { path: "/wellness-programs", element: <WellnessPrograms /> },
  { path: "/experience-booking", element: <ExperienceBooking /> },
  { path: "/studio-rental", element: <StudioRental /> },
  { path: "/craniosacral-therapy-manuel-antonio", element: <CranioSacral /> },
  { path: "/private-gyrotonic-manuel-antonio", element: <Gyrotonic /> },
  { path: "/integrative-kinesiology-course", element: <Kinesiology /> },
  { path: "/contact", element: <Contact /> },
  { path: "/go/:slug", element: <PartnerRedirect /> },
  { path: "/blog", element: <Blog /> },
  { path: "/blog/:slug", element: <BlogPost /> },
  { path: "/faqs", element: <Faqs /> },
  { path: "/terms", element: <Terms /> },
  { path: "/privacy", element: <Privacy /> },
  { path: "/refund", element: <Refund /> },
  { path: "/sas-practitioners", element: <SasPractitioners /> },
  { path: "/certified-practitioners", element: <Navigate to="/sas-practitioners" replace /> },
  { path: "/practitioner/:slug", element: <PractitionerProfile /> },
  { path: "/faq", element: <Navigate to="/faqs" replace /> },
  { path: "/memberships", element: <MembershipsPage /> },
  { path: "/buy", element: <Navigate to="/memberships" replace /> },
  { path: "/passes", element: <Navigate to="/memberships" replace /> },
  { path: "/auth", element: <Auth /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/admin", element: <AdminDashboard /> },
  { path: "/admin/card-authorization-archive", element: <CardAuthorizationArchive /> },
  { path: "/dashboard", element: <ClientDashboard /> },
  { path: "/teacher", element: <TeacherPanel /> },
  { path: "/booking", element: <RedirectPreserve to="/book" /> },
  { path: "/services", element: <Navigate to="/treatments-therapies" replace /> },
  { path: "/treatments", element: <Navigate to="/treatments-therapies" replace /> },
  { path: "/classes/calendar", element: <Navigate to="/classes/schedule" replace /> },
  { path: "/private-classes", element: <Navigate to="/private-sessions" replace /> },
  { path: "/educational", element: <Navigate to="/education" replace /> },
  // Hidden internal payment gateway test — not linked anywhere in the UI
  { path: "/test-payment", element: <TestPayment /> },
  { path: "/test-payment/return", element: <TestPaymentReturn /> },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Phones set to "Reduce motion" get the page without slide/fade effects. */}
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LanguageProvider>
          <ScrollToTop />
          <AnalyticsTracker />
          <ConsentBanner />
          <ThemeApplier />
          <PreviewEditBridge />
          <WhatsAppButton />
          <PromoPopup />
          <PrefetchPages />
          <Suspense fallback={<PageFallback />}>
          <Routes>
            {routeDefs.map((r) => (
              <Route key={`en${r.path}`} path={r.path} element={r.element} />
            ))}
            {routeDefs.map((r) => (
              <Route
                key={`es${r.path}`}
                path={r.path === "/" ? "/es" : `/es${r.path}`}
                element={r.element}
              />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
