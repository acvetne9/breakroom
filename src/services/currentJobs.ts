import { supabase } from "@/integrations/supabase/client";

export interface CurrentJobData {
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
}

export const getCurrentJob = async (deviceId: string): Promise<CurrentJobData | null> => {
  console.log("🔍 Fetching current job for device:", deviceId);

  const { data, error } = await supabase
    .from('current_jobs')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle(); // Use maybeSingle() instead of single() to avoid errors when no rows exist

  if (error) {
    console.error("❌ Error fetching current job:", error);
    throw error;
  }

  console.log("✅ Current job data:", data);
  return data;
};

export const saveCurrentJob = async (
  deviceId: string,
  jobData: CurrentJobData
): Promise<void> => {
  console.log("💾 Saving current job for device:", deviceId);

  // First check if a record exists
  const { data: existing } = await supabase
    .from('current_jobs')
    .select('id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from('current_jobs')
      .update({
        ...jobData,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', deviceId);

    if (error) {
      console.error("❌ Error updating current job:", error);
      throw error;
    }
  } else {
    // Insert new record
    const { error } = await supabase
      .from('current_jobs')
      .insert({
        device_id: deviceId,
        ...jobData,
      });

    if (error) {
      console.error("❌ Error inserting current job:", error);
      throw error;
    }
  }

  console.log("✅ Current job saved successfully");
};

export const deleteCurrentJob = async (deviceId: string): Promise<void> => {
  const { error } = await supabase
    .from('current_jobs')
    .delete()
    .eq('device_id', deviceId);

  if (error) {
    console.error("❌ Error deleting current job:", error);
    throw error;
  }
};
