import { supabase } from "@/integrations/supabase/client";
import { findBusinessIdByName } from "./businessLookup";

export interface PastJobData {
  id?: string;
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
  business_id?: string | null;
}

export const getPastJobs = async (deviceId: string): Promise<PastJobData[]> => {
  console.log("🔍 Fetching past jobs for device:", deviceId);

  const { data, error } = await supabase
    .from("past_jobs")
    .select("*")
    .eq("profile_id", deviceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching past jobs:", error);
    throw error;
  }

  console.log("✅ Past jobs data:", data);
  return data || [];
};

export const savePastJob = async (deviceId: string, jobData: PastJobData): Promise<string> => {
  console.log("💾 Saving past job for device:", deviceId, jobData);

  // Look up business_id if business_name is provided
  let businessId: string | null = null;
  if (jobData.business_name) {
    businessId = await findBusinessIdByName(jobData.business_name);
  }

  if (jobData.id) {
    // Update existing record
    const { error } = await supabase
      .from("past_jobs")
      .update({
        role: jobData.role,
        salary: jobData.salary,
        location: jobData.location,
        business_name: jobData.business_name,
        business_id: businessId,
        time_period: jobData.time_period,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobData.id)
      .eq("profile_id", deviceId);

    if (error) {
      console.error("❌ Error updating past job:", error);
      throw error;
    }

    console.log("✅ Past job updated successfully", businessId ? `(linked to business: ${businessId})` : "(no business link)");
    return jobData.id;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from("past_jobs")
      .insert({
        profile_id: deviceId,
        role: jobData.role,
        salary: jobData.salary,
        location: jobData.location,
        business_name: jobData.business_name,
        business_id: businessId,
        time_period: jobData.time_period,
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ Error inserting past job:", error);
      throw error;
    }

    console.log("✅ Past job inserted successfully", businessId ? `(linked to business: ${businessId})` : "(no business link)");
    return data.id;
  }
};

export const deletePastJob = async (deviceId: string, jobId: string): Promise<void> => {
  const { error } = await supabase.from("past_jobs").delete().eq("id", jobId).eq("profile_id", deviceId);

  if (error) {
    console.error("❌ Error deleting past job:", error);
    throw error;
  }

  console.log("✅ Past job deleted successfully");
};
