-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view own past jobs" ON past_jobs;
DROP POLICY IF EXISTS "Users can create own past jobs" ON past_jobs;
DROP POLICY IF EXISTS "Users can update own past jobs" ON past_jobs;
DROP POLICY IF EXISTS "Users can delete own past jobs" ON past_jobs;

-- Modify past_jobs table structure
ALTER TABLE past_jobs DROP COLUMN IF EXISTS user_id;
ALTER TABLE past_jobs ADD COLUMN profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE past_jobs ADD COLUMN business_name TEXT;
ALTER TABLE past_jobs ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE past_jobs ALTER COLUMN salary TYPE REAL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_past_jobs_profile_id ON past_jobs(profile_id);
CREATE INDEX IF NOT EXISTS idx_past_jobs_created_at ON past_jobs(created_at DESC);

-- Create new profile-based RLS policies
CREATE POLICY "Users can view own past jobs via profile"
ON past_jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Users can create own past jobs via profile"
ON past_jobs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Users can update own past jobs via profile"
ON past_jobs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Users can delete own past jobs via profile"
ON past_jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_past_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_past_jobs_updated_at_trigger
BEFORE UPDATE ON past_jobs
FOR EACH ROW
EXECUTE FUNCTION update_past_jobs_updated_at();