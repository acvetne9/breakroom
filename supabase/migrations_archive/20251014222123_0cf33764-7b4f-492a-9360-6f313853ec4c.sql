-- Step 1: Drop any update_updated_at triggers that might be causing issues
DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
DROP TRIGGER IF EXISTS update_post_vote_count ON public.votes;

-- Step 2: Fix role_votes RLS policy
DROP POLICY IF EXISTS "Users can create their own role votes" ON public.role_votes;
CREATE POLICY "Users can create their own role votes"
ON public.role_votes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = role_votes.user_id 
    AND profiles.user_id = auth.uid()
  )
);

-- Step 3: Add votes_total to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS votes_total INTEGER NOT NULL DEFAULT 0;

-- Step 4: Migrate existing data
UPDATE public.posts 
SET votes_total = COALESCE(upvotes, 0) - COALESCE(downvotes, 0)
WHERE (upvotes IS NOT NULL OR downvotes IS NOT NULL) AND votes_total = 0;

-- Step 5: Drop old columns
ALTER TABLE public.posts DROP COLUMN IF EXISTS upvotes;
ALTER TABLE public.posts DROP COLUMN IF EXISTS downvotes;

-- Step 6: Create function for post votes
CREATE OR REPLACE FUNCTION public.update_post_votes_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.posts 
  SET votes_total = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
      COUNT(*) FILTER (WHERE vote_type = 'downvote'), 
      0
    )
    FROM public.votes 
    WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)
  )
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Step 7: Create trigger for posts
CREATE TRIGGER update_post_votes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_votes_total();

-- Step 8: Create function for business role votes
CREATE OR REPLACE FUNCTION public.update_role_votes_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.business_roles 
  SET votes_total = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
      COUNT(*) FILTER (WHERE vote_type = 'downvote'),
      0
    )
    FROM public.role_votes 
    WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id)
  )
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Step 9: Create trigger for business roles
DROP TRIGGER IF EXISTS update_role_votes_trigger ON public.role_votes;
CREATE TRIGGER update_role_votes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.role_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_role_votes_total();

-- Step 10: Recalculate existing votes_total
UPDATE public.business_roles br
SET votes_total = COALESCE((
  SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
         COUNT(*) FILTER (WHERE vote_type = 'downvote')
  FROM public.role_votes rv
  WHERE rv.business_role_id = br.id
), 0);

UPDATE public.posts p
SET votes_total = COALESCE((
  SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
         COUNT(*) FILTER (WHERE vote_type = 'downvote')
  FROM public.votes v
  WHERE v.post_id = p.id
), 0);