-- Add indexes to improve posts query performance
-- Index for business_id to speed up joins with businesses table
CREATE INDEX IF NOT EXISTS idx_posts_business_id ON public.posts(business_id);

-- Index for created_at to speed up ordering
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

-- Composite index for common query pattern (filtering by business and ordering)
CREATE INDEX IF NOT EXISTS idx_posts_business_created ON public.posts(business_id, created_at DESC);

-- Index for is_comment to speed up filtering comments vs posts
CREATE INDEX IF NOT EXISTS idx_posts_is_comment ON public.posts(is_comment) WHERE is_comment IS NOT NULL;