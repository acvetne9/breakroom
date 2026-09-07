-- Update current_jobs table to support both authenticated and temp users
-- Step 1: Drop old constraint
ALTER TABLE public.current_jobs DROP CONSTRAINT IF EXISTS current_jobs_user_id_fkey;

-- Step 2: Rename column
ALTER TABLE public.current_jobs RENAME COLUMN user_id TO profile_id;

-- Step 3: Add foreign key to profiles table
ALTER TABLE public.current_jobs
  ADD CONSTRAINT current_jobs_profile_id_fkey 
  FOREIGN KEY (profile_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Step 4: Drop old RLS policies
DROP POLICY IF EXISTS "Users can view own current job" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can create own current job" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can update own current job" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can delete own current job" ON public.current_jobs;

-- Step 5: Create new RLS policies that work with profiles
CREATE POLICY "Users can view own current job via profile"
  ON public.current_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = current_jobs.profile_id
      AND (
        (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
        OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
      )
    )
  );

CREATE POLICY "Users can create own current job via profile"
  ON public.current_jobs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = current_jobs.profile_id
      AND (
        (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
        OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
      )
    )
  );

CREATE POLICY "Users can update own current job via profile"
  ON public.current_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = current_jobs.profile_id
      AND (
        (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
        OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
      )
    )
  );

CREATE POLICY "Users can delete own current job via profile"
  ON public.current_jobs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = current_jobs.profile_id
      AND (
        (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
        OR (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
      )
    )
  );