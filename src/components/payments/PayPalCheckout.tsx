import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { classCheckoutReasonMessage } from "@/lib/classBookingWindow";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// Load the PayPal JS SDK once per page, using the public client id from the
// paypal-config edge function (the secret stays on the server).
let sdkPromise: Promise<any> | null = null;
let sdkClientId = "";
function loadPayPalSdk(clientId: string, currency: string): Promise<any> {
  if ((window as any).paypal && sdkClientId === clientId) return Promise.resolve((window as any).paypal);
  if (!sdkPromise || sdkClientId !== clientId) {
    sdkClientId = clientId;
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
      s.onload = () => resolve((window as any).paypal);
      s.onerror = () => reject(new Error("Failed to load PayPal"));
      document.body.appendChild(s);
    });
  }
  return sdkPromise;
}

type CreateBody = () => Record<string, unknown> | null;

/**
 * PayPal Smart Buttons. `createOrderBody` returns the body for
 * paypal-create-order (or null to block); on approval the capture is verified
 * server-side and `onSuccess` fires with the result.
 */
export function PayPalCheckout({
  createOrderBody,
  onSuccess,
  disabled,
}: {
  createOrderBody: CreateBody;
  onSuccess: (result: any) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");

  // Keep the latest callbacks so the rendered buttons always use fresh state.
  const bodyRef = useRef(createOrderBody);
  const successRef = useRef(onSuccess);
  const disabledRef = useRef(disabled);
  bodyRef.current = createOrderBody;
  successRef.current = onSuccess;
  disabledRef.current = disabled;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("paypal-config");
        if (!data?.configured || !data?.clientId) { if (!cancelled) setStatus("unconfigured"); return; }
        const paypal = await loadPayPalSdk(data.clientId, data.currency || "USD");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        // Why the server refused to start a payment (class started, full, …),
        // so the guest reads the real reason instead of a generic PayPal error.
        let refusal: string | null = null;
        paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "pay" },
          onClick: (_: any, actions: any) => {
            if (disabledRef.current || !bodyRef.current()) {
              toast.error("Please complete the required fields first.");
              return actions.reject();
            }
            return actions.resolve();
          },
          createOrder: async () => {
            refusal = null;
            const body = bodyRef.current();
            const res = await invokeEdgeFunction<any>("paypal-create-order", { body });
            if (!res.ok || !res.data?.orderId) {
              refusal = classCheckoutReasonMessage(res.data?.reason) || res.data?.message || null;
              throw new Error(refusal || res.data?.reason || "Could not start the PayPal payment");
            }
            return res.data.orderId as string;
          },
          onApprove: async (approval: any) => {
            const { data: res, error } = await supabase.functions.invoke("paypal-capture-order", {
              body: { orderId: approval.orderID },
            });
            if (error || !res?.ok) {
              toast.error(res?.message || "We couldn't verify the payment. If you were charged, contact us.");
              return;
            }
            successRef.current(res);
          },
          onError: (err: any) => {
            console.error("[paypal] error", err);
            toast.error(refusal || "PayPal ran into a problem. Please try again.");
            refusal = null;
          },
        }).render(containerRef.current);
        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("[paypal] init failed", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "unconfigured") {
    return <p className="text-sm text-muted-foreground text-center py-2">Online payment is being set up. Please contact us to pay.</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-destructive text-center py-2">Couldn't load PayPal. Please refresh and try again.</p>;
  }
  return (
    <div>
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading PayPal…
        </div>
      )}
      <div ref={containerRef} className={disabled ? "opacity-50 pointer-events-none" : ""} />
    </div>
  );
}
