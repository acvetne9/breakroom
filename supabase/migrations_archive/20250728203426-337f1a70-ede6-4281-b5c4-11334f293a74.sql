-- Fix the security warning by setting proper search_path
CREATE OR REPLACE FUNCTION public.update_role_vote_count()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  -- Update the business role's vote counts
  UPDATE public.business_roles 
  SET 
    upvotes = (SELECT COUNT(*) FROM public.role_votes WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id) AND vote_type = 'upvote'),
    downvotes = (SELECT COUNT(*) FROM public.role_votes WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id) AND vote_type = 'downvote')
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;