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
  created_at?: string | null;
}

/** A row the user would consider a real job; anything less is a leftover draft. */
export const isCompletePastJob = (job: Pick<PastJobData, "role" | "salary" | "location" | "time_period">) =>
  !!job.role?.trim() && (job.salary ?? 0) > 0 && !!job.location?.trim() && !!job.time_period;

/** Visible (not hidden) past jobs, newest first. */
export const getPastJobs = async (deviceId: string): Promise<PastJobData[]> => {
  const { data, error } = await supabase
    .from("past_jobs")
    .select("*")
    .eq("profile_id", deviceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    salary: row.salary ?? 0,
    location: row.location ?? "",
    business_name: row.business_name ?? "",
    time_period: row.time_period ?? "HR",
    business_id: row.business_id,
    created_at: row.created_at,
  }));
};

export const savePastJob = async (deviceId: string, jobData: PastJobData): Promise<string> => {
  const businessId = jobData.business_id ?? (jobData.business_name ? await findBusinessIdByName(jobData.business_name) : null);

  const record = {
    role: jobData.role,
    salary: jobData.salary,
    location: jobData.location,
    business_name: jobData.business_name,
    business_id: businessId,
    time_period: jobData.time_period,
  };

  if (jobData.id) {
    const { error } = await supabase
      .from("past_jobs")
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", jobData.id)
      .eq("profile_id", deviceId);
    if (error) throw error;
    return jobData.id;
  }

  const { data, error } = await supabase
    .from("past_jobs")
    .insert({ profile_id: deviceId, ...record })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};

/** Hide a past job. The row stays in the database with `deleted_at` set. */
export const hidePastJob = async (deviceId: string, jobId: string): Promise<void> => {
  const { error } = await supabase
    .from("past_jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("profile_id", deviceId);
  if (error) throw error;
};

/** Permanently remove past jobs. Only used for incomplete drafts. */
export const wipePastJobs = async (deviceId: string, jobIds: string[]): Promise<void> => {
  if (jobIds.length === 0) return;
  const { error } = await supabase.from("past_jobs").delete().eq("profile_id", deviceId).in("id", jobIds);
  if (error) throw error;
};
