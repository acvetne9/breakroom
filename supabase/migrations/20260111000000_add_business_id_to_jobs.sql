-- Add business_id column to current_jobs and past_jobs tables
-- This links user job history to actual businesses in the businesses table

-- Add business_id to current_jobs
ALTER TABLE current_jobs
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

-- Add business_id to past_jobs
ALTER TABLE past_jobs
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_current_jobs_business_id ON current_jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_past_jobs_business_id ON past_jobs(business_id);

-- Add comments
COMMENT ON COLUMN current_jobs.business_id IS 'Links to the businesses table if the business exists in our database';
COMMENT ON COLUMN past_jobs.business_id IS 'Links to the businesses table if the business exists in our database';
