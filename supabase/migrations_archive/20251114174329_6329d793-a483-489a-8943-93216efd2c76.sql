-- Add indexes for better performance on profile and current_jobs lookups
CREATE INDEX IF NOT EXISTS idx_profiles_temp_user_id ON profiles(temp_user_id) WHERE temp_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_browser_fingerprint ON profiles(browser_fingerprint) WHERE browser_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_current_jobs_profile_id ON current_jobs(profile_id);