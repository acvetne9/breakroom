import { supabase } from "@/integrations/supabase/client";
import { cityTables, getCurrentCityId, type CityId } from "@/utils/cities";

/**
 * Look up a business ID by name (case-insensitive exact match) in one city's table.
 * Returns null if no matching business found
 */
export async function findBusinessIdByName(businessName: string, city: CityId = getCurrentCityId()): Promise<string | null> {
  if (!businessName || !businessName.trim()) return null;

  const { data, error } = await supabase
    .from(cityTables(city).businesses)
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
