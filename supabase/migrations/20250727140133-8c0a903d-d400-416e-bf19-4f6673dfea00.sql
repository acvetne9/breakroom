-- Fix search path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix search path for update_post_vote_count function
CREATE OR REPLACE FUNCTION public.update_post_vote_count()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the post's vote counts
  UPDATE public.posts 
  SET 
    upvotes = (SELECT COUNT(*) FROM public.votes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id) AND vote_type = 'upvote'),
    downvotes = (SELECT COUNT(*) FROM public.votes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id) AND vote_type = 'downvote')
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;