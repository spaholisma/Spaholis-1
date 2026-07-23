import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Public half of the VAPID keypair (the private half lives server-side only).
const VAPID_PUBLIC_KEY =
  "BJNC90l4_ukkHaCvrzRnZ0VtaotqSuiEyxJmp7H7fCZCzr8QLUl0L0LbuFqwrFK0kDWT70jJhUqAZgDsI2bkiCI";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = "unsupported" | "off" | "on" | "loading";

/** Bell button: subscribes this device to staff push notifications
 *  ("Nueva reserva …") via the push-only service worker. */
export function PushNotificationsButton() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  const enable = async () => {
    setState("loading");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { toast.error("Sign in first."); setState("off"); return; }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications were blocked — enable them for this site in your browser settings.");
        setState("off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const j = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions" as any).upsert(
        { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth } as any,
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      toast.success("Notifications on — you'll get a push for every new booking.");
      setState("on");
    } catch (e: any) {
      toast.error(e.message || "Could not enable notifications");
      setState("off");
    }
  };

  const disable = async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.from("push_subscriptions" as any).delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      toast.success("Notifications off for this device.");
      setState("off");
    } catch (e: any) {
      toast.error(e.message || "Could not disable");
      setState("on");
    }
  };

  if (state === "unsupported") return null;

  return (
    <Button
      size="sm"
      variant={state === "on" ? "default" : "outline"}
      disabled={state === "loading"}
      onClick={state === "on" ? disable : enable}
      title={state === "on" ? "Push notifications are ON for this device — click to turn off" : "Get a push notification on this device for every new booking"}
    >
      {state === "on" ? <BellRing className="h-4 w-4 mr-1" /> : state === "loading" ? <Bell className="h-4 w-4 mr-1 animate-pulse" /> : <BellOff className="h-4 w-4 mr-1" />}
      {state === "on" ? "Notifications on" : "Notifications"}
    </Button>
  );
}
