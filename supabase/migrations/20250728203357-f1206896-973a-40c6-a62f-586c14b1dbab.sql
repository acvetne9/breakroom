-- Create businesses table
CREATE TABLE public.businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  atmosphere TEXT[] DEFAULT '{}',
  salary TEXT,
  place_id TEXT,
  website TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create business_roles table for role-specific data
CREATE TABLE public.business_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  salary TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create role_votes table to track user votes on business roles
CREATE TABLE public.role_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_role_id UUID NOT NULL REFERENCES public.business_roles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_role_id)
);

-- Enable RLS on all tables
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_votes ENABLE ROW LEVEL SECURITY;

-- Create policies for businesses (public read access)
CREATE POLICY "Anyone can view businesses" 
ON public.businesses 
FOR SELECT 
USING (true);

-- Create policies for business_roles (public read access)
CREATE POLICY "Anyone can view business roles" 
ON public.business_roles 
FOR SELECT 
USING (true);

-- Create policies for role_votes (users can manage their own votes, view all)
CREATE POLICY "Users can view all role votes" 
ON public.role_votes 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own role votes" 
ON public.role_votes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own role votes" 
ON public.role_votes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own role votes" 
ON public.role_votes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create triggers for updated_at columns
CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_roles_updated_at
BEFORE UPDATE ON public.business_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update role vote counts
CREATE OR REPLACE FUNCTION public.update_role_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the business role's vote counts
  UPDATE public.business_roles 
  SET 
    upvotes = (SELECT COUNT(*) FROM public.role_votes WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id) AND vote_type = 'upvote'),
    downvotes = (SELECT COUNT(*) FROM public.role_votes WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id) AND vote_type = 'downvote')
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update vote counts
CREATE TRIGGER update_role_votes_count
AFTER INSERT OR UPDATE OR DELETE ON public.role_votes
FOR EACH ROW
EXECUTE FUNCTION public.update_role_vote_count();