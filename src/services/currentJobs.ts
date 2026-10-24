import { supabase } from "@/integrations/supabase/client";
import { findBusinessIdByName } from "./businessLookup";
import { getCurrentCityId } from "@/utils/cities";

export interface CurrentJobData {
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
  business_id?: string | null;
  /** Which city's business table `business_id` points into. */
  city?: string | null;
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
    city: data.city,
  };
};

/**
 * Insert or replace the profile's single current job. The business is looked
 * up by name in the current city, so the row is tagged with that city.
 */
export const saveCurrentJob = async (profileId: string, jobData: CurrentJobData): Promise<void> => {
  const city = getCurrentCityId();
  const businessId = jobData.business_id ?? (jobData.business_name ? await findBusinessIdByName(jobData.business_name, city) : null);

  const { error } = await supabase.from("current_jobs").upsert(
    {
      profile_id: profileId,
      role: jobData.role,
      salary: jobData.salary,
      location: jobData.location,
      business_name: jobData.business_name,
      time_period: jobData.time_period,
      business_id: businessId,
      city,
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
