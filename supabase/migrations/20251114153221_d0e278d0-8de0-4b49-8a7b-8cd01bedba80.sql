-- Add browser_fingerprint column to profiles table
ALTER TABLE profiles ADD COLUMN browser_fingerprint TEXT;

-- Create index for faster lookups
CREATE INDEX idx_profiles_browser_fingerprint ON profiles(browser_fingerprint);

-- Add comment
COMMENT ON COLUMN profiles.browser_fingerprint IS 'Browser fingerprint for device recovery when localStorage is cleared';