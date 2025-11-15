-- Fix RLS policies to properly use device_id header for temporary users

-- Drop existing policies for current_jobs
DROP POLICY IF EXISTS "Users can view own current job via profile" ON current_jobs;
DROP POLICY IF EXISTS "Users can create own current job via profile" ON current_jobs;
DROP POLICY IF EXISTS "Users can update own current job via profile" ON current_jobs;
DROP POLICY IF EXISTS "Users can delete own current job via profile" ON current_jobs;

-- Drop existing policies for past_jobs
DROP POLICY IF EXISTS "Users can view own past jobs via profile" ON past_jobs;
DROP POLICY IF EXISTS "Users can create own past jobs via profile" ON past_jobs;
DROP POLICY IF EXISTS "Users can update own past jobs via profile" ON past_jobs;
DROP POLICY IF EXISTS "Users can delete own past jobs via profile" ON past_jobs;

-- Create new policies for current_jobs with proper device_id verification
CREATE POLICY "Users can view own current job via profile" ON current_jobs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can create own current job via profile" ON current_jobs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can update own current job via profile" ON current_jobs
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can delete own current job via profile" ON current_jobs
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

-- Create new policies for past_jobs with proper device_id verification
CREATE POLICY "Users can view own past jobs via profile" ON past_jobs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can create own past jobs via profile" ON past_jobs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can update own past jobs via profile" ON past_jobs
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);

CREATE POLICY "Users can delete own past jobs via profile" ON past_jobs
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = past_jobs.profile_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id = current_setting('request.headers', true)::json->>'x-device-id')
    )
  )
);