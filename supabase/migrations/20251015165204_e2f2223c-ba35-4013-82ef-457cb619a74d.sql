-- Fix role_votes RLS policies to support anonymous users

-- 1. Drop existing INSERT policy (only allows authenticated)
DROP POLICY IF EXISTS "Users can create their own role votes" ON role_votes;

-- 2. Create new INSERT policy (allows everyone like posts voting)
CREATE POLICY "Anyone can create role votes" ON role_votes
FOR INSERT
TO public
WITH CHECK (true);

-- 3. Update UPDATE policy to support both auth and temp users
DROP POLICY IF EXISTS "Users can update their own role votes" ON role_votes;

CREATE POLICY "Users can update own role votes" ON role_votes
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = role_votes.user_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

-- 4. Update DELETE policy to support both auth and temp users
DROP POLICY IF EXISTS "Users can delete their own role votes" ON role_votes;

CREATE POLICY "Users can delete own role votes" ON role_votes
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = role_votes.user_id
    AND (
      (auth.uid() IS NOT NULL AND profiles.user_id = auth.uid())
      OR
      (auth.uid() IS NULL AND profiles.temp_user_id IS NOT NULL)
    )
  )
);

-- 5. Ensure unique constraint exists on temp_user_id (defensive programming)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_temp_user_id_key 
ON profiles(temp_user_id) 
WHERE temp_user_id IS NOT NULL;