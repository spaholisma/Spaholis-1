import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { practitioners as staticList, type Practitioner } from "@/data/practitioners";

function mapRow(r: any): Practitioner {
  return {
    slug: r.slug,
    name: r.name,
    role: r.role || "",
    status: Array.isArray(r.status) ? r.status : [],
    bio: r.bio || "",
    image: r.image || "",
    country: r.country || "",
    city: r.city || "",
    languages: Array.isArray(r.languages) ? r.languages : [],
    specialties: Array.isArray(r.specialties) ? r.specialties : [],
    certifications: Array.isArray(r.certifications) ? r.certifications : [],
    yearsExperience: r.years_experience ?? undefined,
    email: r.email || undefined,
    whatsapp: r.whatsapp || undefined,
    website: r.website || undefined,
    bookable: r.bookable ?? true,
    isActive: r.is_active ?? true,
  };
}

/**
 * All practitioners from the DB (admin-managed). Falls back to the static seed
 * list if the table is empty or unreachable, so the directory never goes blank.
 */
export function usePractitioners() {
  return useQuery({
    queryKey: ["practitioners"],
    queryFn: async (): Promise<Practitioner[]> => {
      const { data, error } = await supabase
        .from("practitioners")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error || !data || data.length === 0) return staticList;
      return data.map(mapRow);
    },
    staleTime: 1000 * 60 * 5,
  });
}
