import { useState, useEffect } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Calendar, Briefcase, Users, UserCircle, Settings, Menu, X,
  TrendingUp, Gift, Tag, CalendarDays, GraduationCap, CreditCard, ShieldAlert, DoorOpen, FileEdit, Heart, Package, Sparkles, BookOpen, Image, HelpCircle, Link2, Clock, ArrowLeft, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AdminServicesManager } from "@/components/admin/AdminServicesManager";
import { AdminEventsManager } from "@/components/admin/AdminEventsManager";
import { AdminWeeklySchedule } from "@/components/admin/AdminWeeklySchedule";
import { AdminCalendarView } from "@/components/admin/AdminCalendarView";
import { AdminStaffManager } from "@/components/admin/AdminStaffManager";
import { AdminGiftCardsManager } from "@/components/admin/AdminGiftCardsManager";
import { ClientBookingHistory } from "@/components/admin/ClientBookingHistory";
import { AdminCouponsManager } from "@/components/admin/AdminCouponsManager";
import { AdminLoyaltyManager } from "@/components/admin/AdminLoyaltyManager";
import { AdminSettingsManager } from "@/components/admin/AdminSettingsManager";
import { AdminRoomsManager } from "@/components/admin/AdminRoomsManager";
import { AdminContentEditor } from "@/components/admin/AdminContentEditor";
import { AdminInternalCalendars } from "@/components/admin/AdminInternalCalendars";
import { AdminWellnessOrganizer } from "@/components/admin/AdminWellnessOrganizer";
import { AdminSpaPackagesManager } from "@/components/admin/AdminSpaPackagesManager";
import { AdminCustomRetreats } from "@/components/admin/AdminCustomRetreats";
import AdminExperiencesManager from "@/components/admin/AdminExperiencesManager";
import { AdminBlogManager } from "@/components/admin/AdminBlogManager";
import { AdminProductsManager } from "@/components/admin/AdminProductsManager";
import { AdminTagsManager } from "@/components/admin/AdminTagsManager";
import { AdminOfferingsManager } from "@/components/admin/AdminOfferingsManager";
import { AdminFaqsManager } from "@/components/admin/AdminFaqsManager";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { AdminPaymentIssues } from "@/components/admin/AdminPaymentIssues";
import { AdminBacVerifications } from "@/components/admin/AdminBacVerifications";
import { AdminBacLinks } from "@/components/admin/AdminBacLinks";
import { AdminBusinessHours } from "@/components/admin/AdminBusinessHours";
import { AdminEmailTemplates } from "@/components/admin/AdminEmailTemplates";
import holisLogo from "@/assets/holis-logo-clean.png";
import { toast } from "sonner";
import { format } from "date-fns";

const sidebarLinks = [
  { label: "Dashboard", icon: LayoutDashboard, id: "overview" },
  { label: "Appointments", icon: Calendar, id: "appointments" },
  { label: "Payment Issues", icon: ShieldAlert, id: "payment-issues" },
  { label: "BAC Verifications", icon: ShieldAlert, id: "bac-verifications" },
  { label: "BAC Links", icon: Link2, id: "bac-links" },
  { label: "Services", icon: Briefcase, id: "services" },
  { label: "Classes", icon: CalendarDays, id: "events" },
  { label: "Weekly Schedule", icon: CalendarDays, id: "weekly-schedule" },
  { label: "Business Hours", icon: Clock, id: "business-hours" },
  { label: "Educational", icon: GraduationCap, id: "educational" },
  { label: "Staff", icon: Users, id: "staff" },
  { label: "Clients", icon: UserCircle, id: "clients" },
  { label: "Gift Cards", icon: CreditCard, id: "giftcards" },
  { label: "Loyalty", icon: Gift, id: "loyalty" },
  { label: "Coupons", icon: Tag, id: "coupons" },
  { label: "Rooms", icon: DoorOpen, id: "rooms" },
  { label: "Calendars", icon: CalendarDays, id: "calendars" },
  { label: "Wellness", icon: Heart, id: "wellness" },
  { label: "Spa Packages", icon: Package, id: "spa-packages" },
  { label: "Custom Retreats", icon: Sparkles, id: "custom-retreats" },
  { label: "Experiences", icon: CalendarDays, id: "experiences" },
  { label: "Blog", icon: BookOpen, id: "blog" },
  { label: "FAQs", icon: HelpCircle, id: "faqs" },
  { label: "Products", icon: Package, id: "products" },
  { label: "Memberships", icon: CreditCard, id: "offerings" },
  { label: "Tags", icon: Tag, id: "tags" },
  { label: "Media Library", icon: Image, id: "media" },
  { label: "Content", icon: FileEdit, id: "content" },
  { label: "Client Emails", icon: Mail, id: "client-emails" },
  { label: "Settings", icon: Settings, id: "settings" },
];

// Sections a coordinator (limited staff role) may open. Everything else in the
// sidebar is hidden for them, and the render below refuses to mount it even if
// the tab is forced — the database RLS is the real gate, this is just tidy UI.
const COORDINATOR_TABS = ["calendars", "appointments"];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  // True for a coordinator who is NOT also a full admin.
  const [isCoordinator, setIsCoordinator] = useState(false);
  // True for a read-only viewer (treatments calendar only, no edits, no
  // sensitive data). Cannot also be a coordinator/admin.
  const [isViewer, setIsViewer] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .then(({ data }) => {
          const roles = (data ?? []).map((r) => r.role);
          const fullAdmin = roles.includes("super_admin") || roles.includes("manager");
          const coordinatorOnly = !fullAdmin && roles.includes("coordinator");
          const viewerOnly = !fullAdmin && !coordinatorOnly && roles.includes("viewer");
          setIsAdmin(fullAdmin || coordinatorOnly || viewerOnly);
          setIsCoordinator(coordinatorOnly);
          setIsViewer(viewerOnly);
          // Land a coordinator/viewer on the treatments calendar, not the
          // overview (which they can't see anyway).
          if (coordinatorOnly || viewerOnly) setActiveTab("calendars");
        });
    }
  }, [user, loading, navigate]);

  const visibleLinks = isViewer
    ? sidebarLinks.filter((l) => l.id === "calendars")
    : isCoordinator
    ? sidebarLinks.filter((l) => COORDINATOR_TABS.includes(l.id))
    : sidebarLinks;
  // Belt and suspenders: a coordinator/viewer can never render a restricted
  // section (a viewer only ever gets the treatments calendar).
  const canRender = (id: string) =>
    isViewer ? id === "calendars" : (!isCoordinator || COORDINATOR_TABS.includes(id));

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-body text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <ShieldAlert className="h-16 w-16 text-destructive/60" />
        <h1 className="font-heading text-2xl text-foreground">Access Denied</h1>
        <p className="font-body text-muted-foreground text-center max-w-md">
          You don't have admin privileges. If you believe this is an error, please contact the business owner.
        </p>
        <Button variant="default" onClick={() => navigate("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0 lg:static flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <img src={holisLogo} alt="Holis" className="h-10 w-auto" />
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <p className="px-6 text-xs font-body font-semibold uppercase tracking-wider text-muted-foreground mb-4">Admin Panel</p>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {visibleLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => { setActiveTab(link.id); setSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-colors",
                activeTab === link.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-border flex items-center px-4 sm:px-6 gap-4">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button>
          <h2 className="font-heading text-lg font-medium text-foreground capitalize">{activeTab}</h2>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to site
          </Button>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">
          {activeTab === "overview" && canRender("overview") && <OverviewView />}
          {activeTab === "appointments" && canRender("appointments") && <><AdminCalendarView /><div className="mt-6"><AppointmentsView /></div></>}
          {activeTab === "payment-issues" && <AdminPaymentIssues />}
          {activeTab === "bac-verifications" && <AdminBacVerifications />}
          {activeTab === "bac-links" && <AdminBacLinks />}
          {activeTab === "services" && <AdminServicesManager />}
          {activeTab === "events" && <AdminEventsManager />}
          {activeTab === "weekly-schedule" && <AdminWeeklySchedule />}
          {activeTab === "business-hours" && <AdminBusinessHours />}
          {activeTab === "educational" && <EducationalAdminView />}
          {activeTab === "staff" && <AdminStaffManager />}
          {activeTab === "clients" && <ClientsView />}
          {activeTab === "giftcards" && <AdminGiftCardsManager />}
          {activeTab === "loyalty" && <AdminLoyaltyManager />}
          {activeTab === "coupons" && <AdminCouponsManager />}
          {activeTab === "rooms" && <AdminRoomsManager />}
          {activeTab === "calendars" && canRender("calendars") && <AdminInternalCalendars restrictToTreatment={isCoordinator || isViewer} readOnly={isViewer} />}
          {activeTab === "wellness" && <AdminWellnessOrganizer />}
          {activeTab === "spa-packages" && <AdminSpaPackagesManager />}
          {activeTab === "custom-retreats" && <AdminCustomRetreats />}
          {activeTab === "experiences" && <AdminExperiencesManager />}
          {activeTab === "blog" && <AdminBlogManager />}
          {activeTab === "faqs" && <AdminFaqsManager />}
          {activeTab === "products" && <AdminProductsManager />}
          {activeTab === "offerings" && <AdminOfferingsManager />}
          {activeTab === "tags" && <AdminTagsManager />}
          {activeTab === "media" && <MediaLibrary />}
          {activeTab === "content" && <AdminContentEditor />}
          {activeTab === "client-emails" && <AdminEmailTemplates />}
          {activeTab === "settings" && <AdminSettingsManager />}
        </div>
      </main>
    </div>
  );
};

function OverviewView() {
  const [stats, setStats] = useState({ bookings: 0, clients: 0, revenue: 0, paidBookings: 0 });
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchData = async () => {
      const [b, c, r] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("total_price, status"),
      ]);
      const revenue = (r.data ?? []).filter((x) => x.status === "paid" || x.status === "completed").reduce((sum, x) => sum + (x.total_price || 0), 0);
      const paid = (r.data ?? []).filter((x) => x.status === "paid" || x.status === "completed").length;
      setStats({ bookings: b.count ?? 0, clients: c.count ?? 0, revenue, paidBookings: paid });

      const { data: recent } = await supabase
        .from("bookings")
        .select("*, services(title)")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentBookings(recent ?? []);
    };
    fetchData();
  }, []);

  const cards = [
    { label: "Total Bookings", value: String(stats.bookings), icon: Calendar },
    { label: "Total Clients", value: String(stats.clients), icon: TrendingUp },
    { label: "Revenue", value: formatCRC(stats.revenue), icon: CreditCard },
    { label: "Paid Bookings", value: String(stats.paidBookings), icon: Gift },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl border border-border p-5">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-heading text-2xl font-semibold text-foreground">{stat.value}</p>
            <p className="font-body text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent bookings */}
      <div className="bg-card rounded-2xl border border-border">
        <div className="p-5 border-b border-border">
          <h3 className="font-heading text-lg font-medium text-foreground">Recent Bookings</h3>
        </div>
        <div className="divide-y divide-border">
          {recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-body text-sm font-medium text-foreground">{b.guest_name || "Guest"}</p>
                <p className="font-body text-xs text-muted-foreground">{b.services?.title || "—"} · {b.booking_date}</p>
              </div>
              <span className={cn(
                "text-xs font-body font-semibold px-3 py-1 rounded-full",
                b.status === "paid" || b.status === "completed" ? "bg-spa-sage/15 text-spa-sage" :
                b.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                b.status === "confirmed" ? "bg-accent/15 text-accent" :
                "bg-primary/15 text-primary"
              )}>{b.status}</span>
            </div>
          ))}
          {recentBookings.length === 0 && (
            <p className="p-5 text-center font-body text-sm text-muted-foreground">No bookings yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentsView() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = () => {
    supabase.from("bookings").select("*, services(title)").order("booking_date", { ascending: false }).limit(100).then(({ data }) => setBookings(data ?? []));
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter === "all" ? bookings : bookings.filter((b) => b.status === statusFilter);

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from("bookings").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Booking ${newStatus}`);
    load();
  };

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-medium text-foreground">All Appointments</h3>
        <div className="flex gap-2">
          {["all", "pending", "confirmed", "paid", "completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-body font-medium transition-colors capitalize",
                statusFilter === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Date", "Time", "Guest", "Service", "Status", "Price", "Actions"].map((h) => (
                <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((apt) => (
              <tr key={apt.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-4 font-body text-sm text-foreground">{apt.booking_date}</td>
                <td className="px-5 py-4 font-body text-sm text-foreground">{apt.booking_time}</td>
                <td className="px-5 py-4 font-body text-sm font-medium text-foreground">
                  <div>{apt.guest_name || "—"}</div>
                  {apt.guest_email && <div className="text-xs text-muted-foreground">{apt.guest_email}</div>}
                </td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">{apt.services?.title || "—"}</td>
                <td className="px-5 py-4">
                  <span className={cn(
                    "text-xs font-body font-semibold px-3 py-1 rounded-full",
                    apt.status === "paid" || apt.status === "completed" ? "bg-spa-sage/15 text-spa-sage" :
                    apt.status === "confirmed" ? "bg-accent/15 text-accent" :
                    apt.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                    "bg-primary/15 text-primary"
                  )}>{apt.status}</span>
                </td>
                <td className="px-5 py-4 font-body text-sm text-foreground">{apt.total_price ? formatCRC(apt.total_price) : "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    {apt.status === "pending" && (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => updateStatus(apt.id, "confirmed")}>Confirm</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => updateStatus(apt.id, "cancelled")}>Cancel</Button>
                      </>
                    )}
                    {apt.status === "confirmed" && (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => updateStatus(apt.id, "completed")}>Complete</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => updateStatus(apt.id, "cancelled")}>Cancel</Button>
                      </>
                    )}
                    {apt.status === "paid" && (
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => updateStatus(apt.id, "completed")}>Complete</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">No appointments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientsView() {
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setClients(data ?? []));
  }, []);

  const filtered = clients.filter((c) =>
    (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  if (selectedClient) {
    return <ClientBookingHistory clientId={selectedClient.id} clientName={selectedClient.name} onClose={() => setSelectedClient(null)} />;
  }

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between gap-4">
        <h3 className="font-heading text-lg font-medium text-foreground">Client Directory</h3>
        <input className="border border-border rounded-lg px-3 py-1.5 text-sm font-body bg-background" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Name", "Email", "Phone", "Visits", "Joined"].map((h) => (
                <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedClient({ id: c.user_id, name: c.full_name || "Client" })}>
                <td className="px-5 py-4 font-body text-sm font-medium text-foreground underline decoration-muted-foreground/30">{c.full_name || "—"}</td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">{c.email || "—"}</td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">{c.phone || "—"}</td>
                <td className="px-5 py-4 font-body text-sm text-foreground">{c.total_visits}</td>
                <td className="px-5 py-4 font-body text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EducationalAdminView() {
  const [progress, setProgress] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("user_progress").select("*, services(title)").order("created_at", { ascending: false }).then(({ data }) => setProgress(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="font-heading text-lg font-medium text-foreground">Student Progress</h3>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Student", "Program", "Sessions Completed", "Status"].map((h) => (
                <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {progress.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-5 py-4 font-body text-sm text-foreground">{p.user_id?.slice(0, 8)}...</td>
                <td className="px-5 py-4 font-body text-sm text-foreground">{p.services?.title || "—"}</td>
                <td className="px-5 py-4 font-body text-sm text-foreground">{p.completed_sessions}</td>
                <td className="px-5 py-4">
                  <span className={cn(
                    "text-xs font-body font-semibold px-3 py-1 rounded-full",
                    p.completed ? "bg-spa-sage/15 text-spa-sage" : "bg-primary/15 text-primary"
                  )}>{p.completed ? "Completed" : "In Progress"}</span>
                </td>
              </tr>
            ))}
            {progress.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center font-body text-sm text-muted-foreground">No enrollments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminDashboard;
