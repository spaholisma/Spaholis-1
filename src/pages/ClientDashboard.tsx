import { useEffect, useState } from "react";
import { formatCRC } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Calendar, Clock, User, Gift, ShieldCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/adminEmails";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const ClientDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loyaltySettings, setLoyaltySettings] = useState<any>(null);
  // Staff role, so a coordinator/viewer/admin sees the calendar shortcut here in
  // My Account instead of having to type the /admin URL by hand.
  const [staffRole, setStaffRole] = useState<"admin" | "coordinator" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profileRes, bookingsRes, rewardsRes, loyaltyRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("bookings").select("*, services(title, category)").eq("user_id", user.id).order("booking_date", { ascending: false }),
        supabase.from("loyalty_rewards").select("*").eq("user_id", user.id).order("earned_at", { ascending: false }),
        supabase.from("loyalty_settings").select("*").eq("is_active", true).single(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      setProfile(profileRes.data);
      setBookings(bookingsRes.data ?? []);
      setRewards(rewardsRes.data ?? []);
      setLoyaltySettings(loyaltyRes.data);
      const roles = (rolesRes.data ?? []).map((r: any) => r.role);
      setStaffRole(
        roles.includes("super_admin") || roles.includes("manager")
          ? "admin"
          : roles.includes("coordinator")
          ? "coordinator"
          : roles.includes("viewer")
          ? "viewer"
          : null,
      );
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  // "Upcoming" = still-open AND dated today or later (spa timezone). Without the
  // date test, a never-completed pending booking from months ago sticks here
  // forever. Anything else — done, cancelled, or a past-dated open booking —
  // drops into history so it's not lost.
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
  const isUpcoming = (b: any) => ["pending", "confirmed"].includes(b.status) && b.booking_date >= todayStr;
  const upcoming = bookings.filter(isUpcoming);
  // History shows only visits that actually happened — completed/paid. Cancelled
  // bookings (and stale never-completed ones) are hidden from the customer.
  const past = bookings.filter((b) => ["completed", "paid"].includes(b.status));
  const visitsToReward = loyaltySettings ? loyaltySettings.visits_required - ((profile?.total_visits ?? 0) % loyaltySettings.visits_required) : 0;
  const availableRewards = rewards.filter((r) => !r.is_used && (!r.expires_at || new Date(r.expires_at) > new Date()));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="mb-10">
          <h1 className="spa-heading-lg text-foreground">Welcome back, {profile?.full_name?.split(" ")[0] || "Guest"}</h1>
          <p className="spa-body mt-2">Manage your bookings and rewards.</p>
        </div>

        {/* Staff shortcut into the admin area. Full admins get the whole panel;
            coordinators land straight on the treatments calendar (see
            AdminDashboard — a coordinator's default tab is "calendars"). Shown to
            admin emails OR anyone with a staff role so coordinators no longer
            have to type the /admin URL by hand. The /admin route still enforces
            the real role check server-side; this is only the entry point. */}
        {(isAdminEmail(user?.email) || staffRole) && (() => {
          // Coordinators and viewers land on the treatments calendar; only full
          // admins get the whole panel.
          const calendarOnly = (staffRole === "coordinator" || staffRole === "viewer") && !isAdminEmail(user?.email);
          return (
            <Link
              to="/admin"
              className="mb-8 flex items-center gap-4 bg-spa-sage/10 border border-spa-sage/30 rounded-2xl p-5 hover:bg-spa-sage/15 transition-colors"
            >
              <div className="h-11 w-11 rounded-xl bg-spa-sage/20 flex items-center justify-center shrink-0">
                {calendarOnly
                  ? <Calendar className="h-5 w-5 text-spa-sage" />
                  : <ShieldCheck className="h-5 w-5 text-spa-sage" />}
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-base font-medium text-foreground">
                  {calendarOnly ? "Treatments Calendar" : "Admin Panel"}
                </h3>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  {calendarOnly
                    ? (staffRole === "viewer" ? "View the treatments schedule" : "View and manage the treatments schedule")
                    : "Manage bookings, services, and business settings"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          );
        })()}

        {/* Quick Actions. Book Treatment navigates; the rest jump to a section
            on this page. Notifications was removed — there is no such feature. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <Link to="/book" className="bg-card rounded-2xl border border-border p-5 text-left hover:shadow-md transition-shadow">
            <Calendar className="h-5 w-5 text-muted-foreground mb-3" />
            <h3 className="font-heading text-base font-medium text-foreground">Book Treatment</h3>
            <p className="font-body text-xs text-muted-foreground mt-1">Schedule a visit</p>
          </Link>
          {[
            { icon: Gift, label: "My Rewards", desc: `${availableRewards.length} available`, target: "rewards" },
            { icon: User, label: "Profile", desc: "Edit your info", target: "profile" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => document.getElementById(action.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="bg-card rounded-2xl border border-border p-5 text-left hover:shadow-md transition-shadow"
            >
              <action.icon className="h-5 w-5 text-muted-foreground mb-3" />
              <h3 className="font-heading text-base font-medium text-foreground">{action.label}</h3>
              <p className="font-body text-xs text-muted-foreground mt-1">{action.desc}</p>
            </button>
          ))}
        </div>

        {/* Loyalty Progress */}
        {loyaltySettings && (
          <div id="rewards" className="bg-card rounded-2xl border border-border p-6 mb-10 scroll-mt-24">
            <h2 className="font-heading text-lg font-medium text-foreground mb-4">Loyalty Rewards</h2>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1 bg-muted rounded-full h-3">
                <div
                  className="bg-spa-sage rounded-full h-3 transition-all"
                  style={{ width: `${Math.min(((profile?.total_visits ?? 0) % loyaltySettings.visits_required) / loyaltySettings.visits_required * 100, 100)}%` }}
                />
              </div>
              <span className="text-sm font-body font-medium text-foreground">
                {(profile?.total_visits ?? 0) % loyaltySettings.visits_required}/{loyaltySettings.visits_required}
              </span>
            </div>
            <p className="spa-body-sm">
              {visitsToReward} more visit{visitsToReward !== 1 ? "s" : ""} until your next {loyaltySettings.discount_percentage}% discount!
            </p>
            {availableRewards.length > 0 && (
              <div className="mt-4 p-3 bg-spa-sage/10 rounded-xl">
                <p className="text-sm font-body font-medium text-spa-sage">
                  🎉 You have {availableRewards.length} reward{availableRewards.length > 1 ? "s" : ""} available!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Upcoming */}
        <div className="mb-10">
          <h2 className="spa-heading-md text-foreground mb-6">Upcoming Appointments</h2>
          {upcoming.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <p className="spa-body">No upcoming appointments.</p>
              <Button variant="default" size="sm" className="mt-4" asChild>
                <Link to="/book">Book Now</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {upcoming.map((apt) => (
                <div key={apt.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <h3 className="font-heading text-lg font-medium text-foreground">{apt.services?.title || "Service"}</h3>
                    <div className="flex flex-wrap gap-4 mt-2">
                      <span className="flex items-center gap-1.5 text-sm font-body text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" /> {apt.booking_date}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm font-body text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {apt.booking_time}
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs font-body font-semibold px-3 py-1 rounded-full self-start",
                    apt.status === "confirmed" ? "bg-spa-sage/15 text-spa-sage" : "bg-muted text-muted-foreground"
                  )}>
                    {apt.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile editor */}
        <ProfileSection profile={profile} email={user?.email} onSaved={(p) => setProfile(p)} />

        {/* History */}
        {past.length > 0 && (
          <div>
            <h2 className="spa-heading-md text-foreground mb-6">Booking History</h2>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Service", "Date", "Status", "Price"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {past.map((apt) => (
                      <tr key={apt.id}>
                        <td className="px-5 py-4 font-body text-sm font-medium text-foreground">{apt.services?.title || "—"}</td>
                        <td className="px-5 py-4 font-body text-sm text-muted-foreground">{apt.booking_date}</td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-body font-semibold px-3 py-1 rounded-full bg-spa-sage/15 text-spa-sage">{apt.status}</span>
                        </td>
                        <td className="px-5 py-4 font-body text-sm text-foreground">{apt.total_price ? formatCRC(apt.total_price) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

/** Lets a signed-in customer edit their own name & phone (email is read-only —
 *  it's their login). Saves to their own profiles row (RLS-guarded). */
function ProfileSection({ profile, email, onSaved }: { profile: any; email?: string | null; onSaved: (p: any) => void }) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = fullName !== (profile?.full_name ?? "") || phone !== (profile?.phone ?? "");

  const save = async () => {
    if (!profile?.user_id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
      .eq("user_id", profile.user_id)
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    onSaved(data);
  };

  return (
    <div id="profile" className="bg-card rounded-2xl border border-border p-6 mb-10 scroll-mt-24">
      <h2 className="font-heading text-lg font-medium text-foreground mb-4">Profile</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-sm font-medium mb-1.5 block text-foreground">Full name</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="font-body text-sm font-medium mb-1.5 block text-foreground">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+506 ..." />
        </div>
        <div className="sm:col-span-2">
          <label className="font-body text-sm font-medium mb-1.5 block text-foreground">Email</label>
          <Input value={email ?? ""} disabled className="opacity-70" />
          <p className="font-body text-xs text-muted-foreground mt-1">Your email is your login and can't be changed here.</p>
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving..." : "Save changes"}</Button>
      </div>
    </div>
  );
}

export default ClientDashboard;
