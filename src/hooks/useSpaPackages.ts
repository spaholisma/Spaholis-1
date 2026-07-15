import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRows } from "@/lib/localizeRow";

export interface SpaPackageItem {
  id: string;
  package_id: string;
  treatment_name: string;
  position: number;
}

export interface SpaPackage {
  id: string;
  name: string;
  description: string | null;
  description_rich?: { html?: string } | any;
  duration_label: string | null;
  price: number;
  position: number;
  image_url: string | null;
  gallery_images?: string[] | any;
  booking_url: string | null;
  is_active: boolean;
  /** Mirrored bookable service (kept in sync by a DB trigger) so a package can
   *  be booked directly without picking a treatment from the list. */
  service_id: string | null;
  items: SpaPackageItem[];
}

const PACKAGE_I18N_FIELDS = ["name", "description", "duration_label", "description_rich"];
const PACKAGE_ITEM_I18N_FIELDS = ["treatment_name"];

export function useSpaPackages() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["spa-packages", language],
    queryFn: async (): Promise<SpaPackage[]> => {
      const { data: packages, error: pErr } = await supabase
        .from("spa_packages")
        .select("*")
        .order("position");
      if (pErr) throw pErr;

      const { data: items, error: iErr } = await supabase
        .from("spa_package_items")
        .select("*")
        .order("position");
      if (iErr) throw iErr;

      const localizedPackages = localizeRows(packages as any[], language, PACKAGE_I18N_FIELDS);
      const localizedItems = localizeRows(items as any[], language, PACKAGE_ITEM_I18N_FIELDS);

      return (localizedPackages || []).map((pkg: any) => ({
        ...pkg,
        items: (localizedItems || []).filter((i: any) => i.package_id === pkg.id),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSavePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: Partial<SpaPackage> & { id: string }) => {
      const { error } = await supabase
        .from("spa_packages")
        .update({
          name: pkg.name,
          description: pkg.description,
          description_rich: pkg.description_rich ?? { html: "" },
          duration_label: pkg.duration_label,
          price: pkg.price,
          position: pkg.position,
          image_url: pkg.image_url,
          gallery_images: pkg.gallery_images ?? [],
          booking_url: pkg.booking_url,
          is_active: pkg.is_active,
        })
        .eq("id", pkg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spa-packages"] });
      toast.success("Package saved!");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useSavePackageItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ packageId, items }: { packageId: string; items: { treatment_name: string; position: number }[] }) => {
      const { error: delErr } = await supabase
        .from("spa_package_items")
        .delete()
        .eq("package_id", packageId);
      if (delErr) throw delErr;

      if (items.length > 0) {
        const { error: insErr } = await supabase
          .from("spa_package_items")
          .insert(items.map(i => ({ package_id: packageId, ...i })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spa-packages"] });
      toast.success("Treatments saved!");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: { name: string; description?: string; duration_label?: string; price?: number; position?: number }) => {
      const { error } = await supabase.from("spa_packages").insert(pkg);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spa-packages"] });
      toast.success("Package created!");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("spa_packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spa-packages"] });
      toast.success("Package deleted!");
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useReorderPackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (packages: { id: string; position: number }[]) => {
      for (const pkg of packages) {
        const { error } = await supabase
          .from("spa_packages")
          .update({ position: pkg.position })
          .eq("id", pkg.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spa-packages"] });
      toast.success("Order saved!");
    },
    onError: (err: any) => toast.error(err.message),
  });
}
