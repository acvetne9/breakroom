-- Fix role_votes RLS policies to use profile lookup
-- Drop existing policies that incorrectly use auth.uid() = user_id
DROP POLICY IF EXISTS "Users can create their own role votes" ON public.role_votes;
DROP POLICY IF EXISTS "Users can update their own role votes" ON public.role_votes;
DROP POLICY IF EXISTS "Users can delete their own role votes" ON public.role_votes;

-- Create new policies with profile lookup
-- These check if the current user's profile ID matches role_votes.user_id
CREATE POLICY "Users can create their own role votes"
  ON public.role_votes
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = user_id 
      AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own role votes"
  ON public.role_votes
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = role_votes.user_id 
      AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own role votes"
  ON public.role_votes
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = role_votes.user_id 
      AND profiles.user_id = auth.uid()
    )
  );