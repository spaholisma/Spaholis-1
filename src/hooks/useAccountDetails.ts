import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toE164 } from "@/lib/phone";
import type { IdDocumentType } from "@/lib/localDiscount";

export interface AccountDetails {
  userId: string;
  name: string;
  email: string;
  /** E.164, ready for the phone field ("" when not on file). */
  phone: string;
  idDocument: string;
  idDocumentType: IdDocumentType | null;
}

/**
 * What a signed-in student's account knows about them, to fill in a form.
 * Null when nobody is signed in (then the form starts empty).
 */
export function useAccountDetails(): AccountDetails | null {
  const { user } = useAuth();
  const [details, setDetails] = useState<AccountDetails | null>(null);
  useEffect(() => {
    if (!user) { setDetails(null); return; }
    let live = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles").select("full_name, email, phone, id_document, id_document_type")
        .eq("user_id", user.id).maybeSingle();
      if (!live) return;
      const t = (data as any)?.id_document_type;
      setDetails({
        userId: user.id,
        name: (data as any)?.full_name || (user.user_metadata as any)?.full_name || "",
        email: (data as any)?.email || user.email || "",
        phone: toE164((data as any)?.phone),
        idDocument: (data as any)?.id_document || "",
        idDocumentType: t === "cr_cedula" || t === "other" ? t : null,
      });
    })();
    return () => { live = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return details;
}
