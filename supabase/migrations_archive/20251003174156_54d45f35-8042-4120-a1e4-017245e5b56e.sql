-- Drop all policies that depend on temp_user_id column
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own current job via profile" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can create own current job via profile" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can update own current job via profile" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can delete own current job via profile" ON public.current_jobs;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own votes" ON public.votes;
DROP POLICY IF EXISTS "Users can update own votes" ON public.votes;

-- Change temp_user_id from UUID to TEXT to support device ID strings
ALTER TABLE public.profiles 
ALTER COLUMN temp_user_id TYPE TEXT;

-- Recreate all policies with corrected logic
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT 
WITH CHECK (
  ((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)) 
  OR ((auth.uid() IS NULL) AND (temp_user_id IS NOT NULL))
);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE 
USING (
  ((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)) 
  OR ((auth.uid() IS NULL) AND (temp_user_id IS NOT NULL))
);

CREATE POLICY "Users can view own current job via profile" ON public.current_jobs
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can create own current job via profile" ON public.current_jobs
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can update own current job via profile" ON public.current_jobs
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can delete own current job via profile" ON public.current_jobs
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = current_jobs.profile_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can delete own posts" ON public.posts
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = posts.user_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can update own posts" ON public.posts
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = posts.user_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can delete own votes" ON public.votes
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = votes.user_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);

CREATE POLICY "Users can update own votes" ON public.votes
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = votes.user_id
    AND (
      ((auth.uid() IS NOT NULL) AND (profiles.user_id = auth.uid()))
      OR ((auth.uid() IS NULL) AND (profiles.temp_user_id IS NOT NULL))
    )
  )
);