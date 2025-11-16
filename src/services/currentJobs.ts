import { supabase } from "@/integrations/supabase/client";
import { getUserProfile } from "./posts";

export interface CurrentJobData {
  role: string;
  salary: number;
  location: string;
  business_name?: string;
  time_period: string;
}

/**
 * Check if the current user (authenticated or temp) has a current job
 */
export const hasCurrentJob = async (): Promise<boolean> => {
  try {
    const { profileId } = await getUserProfile();
    
    const { data, error } = await supabase
      .from('current_jobs')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking current job:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error('Error in hasCurrentJob:', error);
    return false;
  }
};

/**
 * Get the current job for the current user
 */
export const getCurrentJob = async (): Promise<CurrentJobData | null> => {
  try {
    const { profileId } = await getUserProfile();
    console.log('📋 Fetching current job for profile:', profileId);
    
    const { data, error } = await supabase
      .from('current_jobs')
      .select('role, salary, location, business_name, time_period')
      .eq('profile_id', profileId)
      .maybeSingle();
    
    if (error) {
      console.error('❌ Error fetching current job:', error);
      throw error;
    }
    
    console.log('✅ Current job fetched:', data ? 'found' : 'not found');
    return data;
  } catch (error) {
    console.error('❌ Error in getCurrentJob:', error);
    throw error;
  }
};

/**
 * Create or update the current job for the current user
 * Returns the full saved job data
 */
export const saveCurrentJob = async (jobData: CurrentJobData): Promise<CurrentJobData> => {
  try {
    const { profileId } = await getUserProfile();
    console.log('💾 Saving current job for profile:', profileId);
    
    // Check if a current job already exists
    const { data: existing } = await supabase
      .from('current_jobs')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();
    
    if (existing) {
      // Update existing job
      const { data, error } = await supabase
        .from('current_jobs')
        .update({
          role: jobData.role,
          salary: jobData.salary,
          location: jobData.location,
          business_name: jobData.business_name,
          time_period: jobData.time_period,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select('role, salary, location, business_name, time_period')
        .single();
      
      if (error) throw error;
      console.log('✅ Current job updated');
      return data;
    } else {
      // Create new job
      const { data, error } = await supabase
        .from('current_jobs')
        .insert({
          profile_id: profileId,
          role: jobData.role,
          salary: jobData.salary,
          location: jobData.location,
          business_name: jobData.business_name,
          time_period: jobData.time_period
        })
        .select('role, salary, location, business_name, time_period')
        .single();
      
      if (error) throw error;
      console.log('✅ Current job created');
      return data;
    }
  } catch (error) {
    console.error('❌ Error saving current job:', error);
    throw error;
  }
};

/**
 * Delete the current job for the current user
 */
export const deleteCurrentJob = async (): Promise<void> => {
  try {
    const { profileId } = await getUserProfile();
    
    const { error } = await supabase
      .from('current_jobs')
      .delete()
      .eq('profile_id', profileId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting current job:', error);
    throw error;
  }
};
