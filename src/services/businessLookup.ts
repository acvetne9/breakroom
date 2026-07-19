import { supabase } from "@/integrations/supabase/client";

/**
 * Look up a business ID by name (case-insensitive exact match)
 * Returns null if no matching business found
 */
export async function findBusinessIdByName(businessName: string): Promise<string | null> {
  if (!businessName || !businessName.trim()) return null;

  console.log(`🔍 Looking up business ID for: "${businessName}"`);

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
    console.log(`✅ Found business ID: ${data.id}`);
    return data.id;
  }

  console.log(`ℹ️ No matching business found for: "${businessName}"`);
  return null;
}
