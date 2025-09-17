-- Temporarily allow anonymous users to create posts until authentication is implemented
DROP POLICY IF EXISTS "Users can create own posts" ON public.posts;

CREATE POLICY "Anyone can create posts temporarily" 
ON public.posts 
FOR INSERT 
WITH CHECK (true);

-- Also allow anonymous users to vote temporarily  
DROP POLICY IF EXISTS "Users can create own votes" ON public.votes;

CREATE POLICY "Anyone can create votes temporarily"
ON public.votes
FOR INSERT  
WITH CHECK (true);