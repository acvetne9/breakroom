-- Add columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temp_user_id UUID UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_authenticated BOOLEAN NOT NULL DEFAULT true;

-- Make user_id nullable to allow system profiles
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- Insert a profile for the default system user (with NULL auth user_id)
INSERT INTO public.profiles (id, user_id, display_name, is_authenticated, temp_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  NULL,
  'System', 
  false,
  '00000000-0000-0000-0000-000000000000'::uuid
) ON CONFLICT (id) DO NOTHING;

-- Update constraints to reference profiles table
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey;
ALTER TABLE public.posts ADD CONSTRAINT posts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_user_id_fkey;
ALTER TABLE public.votes ADD CONSTRAINT votes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update RLS policies
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND temp_user_id IS NOT NULL)
);

CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  (auth.uid() IS NULL AND temp_user_id IS NOT NULL)
);

-- Update posts RLS policies  
DROP POLICY IF EXISTS "Anyone can create posts temporarily" ON public.posts;
DROP POLICY IF EXISTS "Anyone can create posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;

CREATE POLICY "Anyone can create posts" 
ON public.posts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can delete own posts" 
ON public.posts 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = posts.user_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Users can update own posts" 
ON public.posts 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = posts.user_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

-- Update votes RLS policies
DROP POLICY IF EXISTS "Anyone can create votes temporarily" ON public.votes;
DROP POLICY IF EXISTS "Anyone can create votes" ON public.votes;
DROP POLICY IF EXISTS "Users can delete own votes" ON public.votes;
DROP POLICY IF EXISTS "Users can update own votes" ON public.votes;

CREATE POLICY "Anyone can create votes" 
ON public.votes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can delete own votes" 
ON public.votes 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = votes.user_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

CREATE POLICY "Users can update own votes" 
ON public.votes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = votes.user_id 
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid()) OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);