-- Add votes_total column to business_roles
ALTER TABLE public.business_roles 
ADD COLUMN votes_total integer DEFAULT 0;

-- Migrate existing data: votes_total = upvotes - downvotes
UPDATE public.business_roles 
SET votes_total = COALESCE(upvotes, 0) - COALESCE(downvotes, 0);

-- Drop old columns
ALTER TABLE public.business_roles 
DROP COLUMN upvotes,
DROP COLUMN downvotes;

-- Update the trigger function to use votes_total
CREATE OR REPLACE FUNCTION public.update_role_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Calculate total votes (upvotes - downvotes)
  UPDATE public.business_roles 
  SET votes_total = (
    SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
           COUNT(*) FILTER (WHERE vote_type = 'downvote')
    FROM public.role_votes 
    WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id)
  )
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;