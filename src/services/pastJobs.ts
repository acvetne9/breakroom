import { supabase } from "@/integrations/supabase/client";

export interface PastJobData {
  id?: string;
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
}

export const getPastJobs = async (deviceId: string): Promise<PastJobData[]> => {
  console.log("🔍 Fetching past jobs for device:", deviceId);

  const { data, error } = await supabase
    .from('past_jobs')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("❌ Error fetching past jobs:", error);
    throw error;
  }

  console.log("✅ Past jobs data:", data);
  return data || [];
};

export const savePastJob = async (
  deviceId: string,
  jobData: PastJobData
): Promise<string> => {
  console.log("💾 Saving past job for device:", deviceId, jobData);

  if (jobData.id) {
    // Update existing record
    const { error } = await supabase
      .from('past_jobs')
      .update({
        role: jobData.role,
        salary: jobData.salary,
        location: jobData.location,
        business_name: jobData.business_name,
        time_period: jobData.time_period,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobData.id)
      .eq('device_id', deviceId);

    if (error) {
      console.error("❌ Error updating past job:", error);
      throw error;
    }

    console.log("✅ Past job updated successfully");
    return jobData.id;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from('past_jobs')
      .insert({
        device_id: deviceId,
        role: jobData.role,
        salary: jobData.salary,
        location: jobData.location,
        business_name: jobData.business_name,
        time_period: jobData.time_period,
      })
      .select('id')
      .single();

    if (error) {
      console.error("❌ Error inserting past job:", error);
      throw error;
    }

    console.log("✅ Past job inserted successfully");
    return data.id;
  }
};

export const deletePastJob = async (deviceId: string, jobId: string): Promise<void> => {
  const { error } = await supabase
    .from('past_jobs')
    .delete()
    .eq('id', jobId)
    .eq('device_id', deviceId);

  if (error) {
    console.error("❌ Error deleting past job:", error);
    throw error;
  }

  console.log("✅ Past job deleted successfully");
};
