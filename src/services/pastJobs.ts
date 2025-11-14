import { supabase } from "@/integrations/supabase/client";
import { getUserProfile } from "./posts";

export interface PastJobData {
  id?: string;
  role: string;
  salary: number;
  location: string;
  business_name?: string;
  time_period: string;
}

/**
 * Get all past jobs for the current user
 */
export const getPastJobs = async (): Promise<PastJobData[]> => {
  try {
    const { profileId } = await getUserProfile();
    
    const { data, error } = await supabase
      .from('past_jobs')
      .select('id, role, salary, location, business_name, time_period')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching past jobs:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getPastJobs:', error);
    return [];
  }
};

/**
 * Save or update a single past job
 * Returns the job ID
 */
export const savePastJob = async (jobData: PastJobData): Promise<string> => {
  try {
    const { profileId } = await getUserProfile();
    
    if (jobData.id) {
      // Update existing job
      const { data, error } = await supabase
        .from('past_jobs')
        .update({
          role: jobData.role,
          salary: jobData.salary,
          location: jobData.location,
          business_name: jobData.business_name,
          time_period: jobData.time_period,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobData.id)
        .select('id')
        .single();
      
      if (error) throw error;
      return data.id;
    } else {
      // Create new job
      const { data, error } = await supabase
        .from('past_jobs')
        .insert({
          profile_id: profileId,
          role: jobData.role,
          salary: jobData.salary,
          location: jobData.location,
          business_name: jobData.business_name,
          time_period: jobData.time_period
        })
        .select('id')
        .single();
      
      if (error) throw error;
      return data.id;
    }
  } catch (error) {
    console.error('Error saving past job:', error);
    throw error;
  }
};

/**
 * Delete a specific past job by ID
 */
export const deletePastJob = async (jobId: string): Promise<void> => {
  try {
    const { profileId } = await getUserProfile();
    
    const { error } = await supabase
      .from('past_jobs')
      .delete()
      .eq('id', jobId)
      .eq('profile_id', profileId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting past job:', error);
    throw error;
  }
};

/**
 * Save multiple past jobs at once
 * Handles both inserts and updates
 */
export const savePastJobs = async (jobs: PastJobData[]): Promise<void> => {
  try {
    const { profileId } = await getUserProfile();
    
    // Helper function to check if ID is a real database UUID
    const isRealDatabaseId = (id?: string): boolean => {
      if (!id) return false;
      // Temp IDs start with "temp_"
      if (id.startsWith('temp_')) return false;
      // Real UUIDs match this pattern
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidPattern.test(id);
    };
    
    // Separate new jobs (no id OR temp id) from existing jobs (real UUID)
    const newJobs = jobs.filter(job => !isRealDatabaseId(job.id));
    const existingJobs = jobs.filter(job => isRealDatabaseId(job.id));
    
    console.log(`📊 Saving past jobs: ${newJobs.length} new, ${existingJobs.length} existing`);
    
    // Insert new jobs (don't include the temp id)
    if (newJobs.length > 0) {
      const { error: insertError } = await supabase
        .from('past_jobs')
        .insert(
          newJobs.map(job => ({
            profile_id: profileId,
            role: job.role,
            salary: job.salary,
            location: job.location,
            business_name: job.business_name,
            time_period: job.time_period
            // NOTE: Do NOT include job.id here - let database generate UUID
          }))
        );
      
      if (insertError) throw insertError;
    }
    
    // Update existing jobs one by one (only real database records)
    for (const job of existingJobs) {
      await savePastJob(job);
    }
  } catch (error) {
    console.error('Error saving past jobs:', error);
    throw error;
  }
};
