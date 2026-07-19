import { supabase } from "@/integrations/supabase/client";

export interface CurrentJobData {
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
  business_id?: string | null;
}

/**
 * Look up a business ID by name (case-insensitive exact match)
 * Returns null if no matching business found
 */
async function findBusinessIdByName(businessName: string): Promise<string | null> {
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

export const getCurrentJob = async (profileId: string): Promise<CurrentJobData | null> => {
  console.log("🔍 Fetching current job for device:", profileId);

  const { data, error } = await supabase.from("current_jobs").select("*").eq("profile_id", profileId).maybeSingle(); // Use maybeSingle() instead of single() to avoid errors when no rows exist

  if (error) {
    console.error("❌ Error fetching current job:", error);
    throw error;
  }

  console.log("✅ Current job data:", data);
  return data;
};

export const saveCurrentJob = async (profileId: string, jobData: CurrentJobData): Promise<void> => {
  console.log("💾 Saving current job for device:", profileId);
  console.log("   Input data:", {
    role: jobData.role,
    salary: jobData.salary,
    location: jobData.location,
    business_name: jobData.business_name,
    time_period: jobData.time_period,
    business_id: jobData.business_id,
  });

  // Use provided business_id if available, otherwise look it up by name
  let businessId: string | null = jobData.business_id || null;
  if (!businessId && jobData.business_name) {
    console.log("   No business_id provided, looking up by name...");
    businessId = await findBusinessIdByName(jobData.business_name);
  }

  const dataToSave = {
    ...jobData,
    business_id: businessId,
  };

  console.log("   Final data to save:", {
    ...dataToSave,
    hasBusinessId: !!businessId,
    hasLocation: !!dataToSave.location,
  });

  // Insert or update in a single query using UPSERT on the profile_id unique key
  const { error } = await supabase.from("current_jobs").upsert(
    {
      profile_id: profileId,
      ...dataToSave,
      updated_at: new Date().toISOString(),
    } as any,
    {
      onConflict: "profile_id",
    },
  );

  if (error) {
    console.error("❌ Error saving current job:", error);
    throw error;
  }

  console.log("✅ Current job saved successfully", businessId ? `(linked to business: ${businessId})` : "(no business link)");
};

export const deleteCurrentJob = async (profileId: string): Promise<void> => {
  const { error } = await supabase.from("current_jobs").delete().eq("profile_id", profileId);

  if (error) {
    console.error("❌ Error deleting current job:", error);
    throw error;
  }
};
