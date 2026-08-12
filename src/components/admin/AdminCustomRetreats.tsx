import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { Eye, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminRetreatOptions } from "./AdminRetreatOptions";

type Inquiry = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  retreat_vision: string[];
  preferred_activities: string[];
  group_type: string;
  preferred_dates: string | null;
  flexible_dates: boolean;
  length_of_stay: string | null;
  budget_range: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  num_participants: string | null;
  special_requests: string | null;
  status: string;
  created_at: string;
};

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-red-100 text-red-800",
};

export function AdminCustomRetreats() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("custom_retreat_inquiries")
      .select("*")
      .order("created_at", { ascending: false }) as { data: Inquiry[] | null };
    setInquiries(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("custom_retreat_inquiries")
      .update({ status } as any)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status updated to ${status}`);
    load();
    if (selected?.id === id) setSelected((s) => s ? { ...s, status } : null);
  };

  return (
    <Tabs defaultValue="inquiries">
      <TabsList className="mb-4">
        <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
        <TabsTrigger value="options">Form Options</TabsTrigger>
      </TabsList>

      <TabsContent value="options">
        <AdminRetreatOptions />
      </TabsContent>

      <TabsContent value="inquiries">
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Custom Retreat Inquiries</h2>
        <p className="text-sm text-muted-foreground font-body">Personalized retreat requests from guests</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground font-body py-8 text-center">Loading…</p>
      ) : inquiries.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body py-8 text-center">No custom retreat inquiries yet.</p>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <div
              key={inq.id}
              className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelected(inq)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-body text-sm font-medium text-foreground">{inq.full_name}</p>
                  <Badge className={statusColors[inq.status] || ""}>{inq.status}</Badge>
                </div>
                <p className="font-body text-xs text-muted-foreground">{inq.email}</p>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  {format(new Date(inq.created_at), "MMM d, yyyy · h:mm a")}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0">
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <div className="space-y-5">
              <DialogTitle className="font-heading text-xl font-medium text-foreground">
                {selected.full_name}
              </DialogTitle>

              <div className="grid grid-cols-2 gap-3 text-sm font-body">
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p className="text-foreground">{selected.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Phone</p>
                  <p className="text-foreground">{selected.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Arrival</p>
                  <p className="text-foreground">{selected.arrival_date || selected.preferred_dates || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Departure</p>
                  <p className="text-foreground">{selected.departure_date || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Participants</p>
                  <p className="text-foreground">{selected.num_participants || selected.length_of_stay || "—"}</p>
                </div>
              </div>

              {selected.retreat_vision.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-body mb-1.5">Intention</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.retreat_vision.map((v) => (
                      <Badge key={v} variant="secondary">{v}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selected.preferred_activities.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-body mb-1.5">Services &amp; Activities</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.preferred_activities.map((a) => (
                      <Badge key={a} variant="outline">{a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selected.special_requests && (
                <div>
                  <p className="text-xs text-muted-foreground font-body mb-1">Special Requests</p>
                  <p className="text-sm font-body text-foreground whitespace-pre-line">{selected.special_requests}</p>
                </div>
              )}

              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground font-body mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {["new", "contacted", "confirmed", "completed", "cancelled"].map((s) => (
                    <Button
                      key={s}
                      variant={selected.status === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateStatus(selected.id, s)}
                      className="capitalize text-xs"
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
      </TabsContent>
    </Tabs>
  );
}
