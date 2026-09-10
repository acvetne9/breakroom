import { supabase } from "@/integrations/supabase/client";
import { findBusinessIdByName } from "./businessLookup";

export interface CurrentJobData {
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
  business_id?: string | null;
}

export const getCurrentJob = async (profileId: string): Promise<CurrentJobData | null> => {
  const { data, error } = await supabase.from("current_jobs").select("*").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    role: data.role ?? "",
    salary: data.salary ?? 0,
    location: data.location ?? "",
    business_name: data.business_name ?? "",
    time_period: data.time_period ?? "HR",
    business_id: data.business_id,
  };
};

/** Insert or replace the profile's single current job. */
export const saveCurrentJob = async (profileId: string, jobData: CurrentJobData): Promise<void> => {
  const businessId = jobData.business_id ?? (jobData.business_name ? await findBusinessIdByName(jobData.business_name) : null);

  const { error } = await supabase.from("current_jobs").upsert(
    {
      profile_id: profileId,
      role: jobData.role,
      salary: jobData.salary,
      location: jobData.location,
      business_name: jobData.business_name,
      time_period: jobData.time_period,
      business_id: businessId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) throw error;
};

export const deleteCurrentJob = async (profileId: string): Promise<void> => {
  const { error } = await supabase.from("current_jobs").delete().eq("profile_id", profileId);
  if (error) throw error;
};

/** Retire the current job into past jobs. Returns the new past-job id, or null if there was no current job. */
export const moveCurrentJobToPast = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc("move_current_job_to_past");
  if (error) throw error;
  return data ?? null;
};
