import { supabase } from "@/integrations/supabase/client";

/**
 * Look up a business ID by name (case-insensitive exact match)
 * Returns null if no matching business found
 */
export async function findBusinessIdByName(businessName: string): Promise<string | null> {
  if (!businessName || !businessName.trim()) return null;

  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .ilike("name", businessName.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("⚠️ Error looking up business:", error);
    return null;
  }

  if (data) {
    return data.id;
  }

  return null;
}
