-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create posts table for job stories and updates
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  job_role TEXT,
  salary INTEGER,
  location TEXT,
  time_period TEXT,
  post_type TEXT NOT NULL CHECK (post_type IN ('job_update', 'story', 'past_job')),
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Create votes table
CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS on votes
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Create past jobs table
CREATE TABLE public.past_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  salary INTEGER,
  location TEXT,
  time_period TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on past jobs
ALTER TABLE public.past_jobs ENABLE ROW LEVEL SECURITY;

-- Create current job table
CREATE TABLE public.current_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role TEXT,
  salary INTEGER,
  location TEXT,
  time_period TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on current jobs
ALTER TABLE public.current_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for posts
CREATE POLICY "Anyone can view posts" ON public.posts
  FOR SELECT USING (true);

CREATE POLICY "Users can create own posts" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for votes
CREATE POLICY "Users can view all votes" ON public.votes
  FOR SELECT USING (true);

CREATE POLICY "Users can create own votes" ON public.votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes" ON public.votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON public.votes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for past jobs
CREATE POLICY "Users can view own past jobs" ON public.past_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own past jobs" ON public.past_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own past jobs" ON public.past_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own past jobs" ON public.past_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for current jobs
CREATE POLICY "Users can view own current job" ON public.current_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own current job" ON public.current_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own current job" ON public.current_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own current job" ON public.current_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_current_jobs_updated_at
  BEFORE UPDATE ON public.current_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update post vote counts
CREATE OR REPLACE FUNCTION public.update_post_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the post's vote counts
  UPDATE public.posts 
  SET 
    upvotes = (SELECT COUNT(*) FROM public.votes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id) AND vote_type = 'upvote'),
    downvotes = (SELECT COUNT(*) FROM public.votes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id) AND vote_type = 'downvote')
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update vote counts when votes change
CREATE TRIGGER update_vote_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_vote_count();