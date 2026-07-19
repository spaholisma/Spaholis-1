import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import Index from "./pages/Index";
import About from "./pages/About";
import SignatureTreatments from "./pages/SignatureTreatments";
import Services from "./pages/Services";
import Booking from "./pages/Booking";
import BookingReturn from "./pages/BookingReturn";
import Classes from "./pages/Classes";
import ClassesCalendar from "./pages/ClassesCalendar";
import PrivateClasses from "./pages/PrivateClasses";
import ClassBooking from "./pages/ClassBooking";
import Educational from "./pages/Educational";
import GiftCards from "./pages/GiftCards";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import CardAuthorizationArchive from "./pages/CardAuthorizationArchive";
import ClientDashboard from "./pages/ClientDashboard";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import Retreats from "./pages/Retreats";
import RetreatDetail from "./pages/RetreatDetail";
import CustomRetreat from "./pages/CustomRetreat";
import ExperienceBooking from "./pages/ExperienceBooking";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Faqs from "./pages/Faqs";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Refund from "./pages/Refund";
import SasPractitioners from "./pages/SasPractitioners";
import PractitionerProfile from "./pages/PractitionerProfile";
import TestPayment from "./pages/TestPayment";
import TestPaymentReturn from "./pages/TestPaymentReturn";
import { WhatsAppButton } from "./components/WhatsAppButton";
import { PreviewEditBridge } from "./components/PreviewEditBridge";
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
  { path: "/signature-treatments", element: <SignatureTreatments /> },
  { path: "/book", element: <Booking /> },
  { path: "/booking/return", element: <BookingReturn /> },
  { path: "/classes", element: <Classes /> },
  { path: "/classes/schedule", element: <ClassesCalendar /> },
  { path: "/private-sessions", element: <PrivateClasses /> },
  { path: "/class-booking", element: <ClassBooking /> },
  { path: "/education", element: <Educational /> },
  { path: "/gift-cards", element: <GiftCards /> },
  { path: "/retreats", element: <Retreats /> },
  { path: "/retreats/:slug", element: <RetreatDetail /> },
  { path: "/custom-retreat", element: <CustomRetreat /> },
  { path: "/experience-booking", element: <ExperienceBooking /> },
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
  { path: "/buy", element: <Navigate to="/classes#buy" replace /> },
  { path: "/memberships", element: <Navigate to="/classes#buy" replace /> },
  { path: "/passes", element: <Navigate to="/classes#buy" replace /> },
  { path: "/auth", element: <Auth /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/admin", element: <AdminDashboard /> },
  { path: "/admin/card-authorization-archive", element: <CardAuthorizationArchive /> },
  { path: "/dashboard", element: <ClientDashboard /> },
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
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LanguageProvider>
          <PreviewEditBridge />
          <WhatsAppButton />
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
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
