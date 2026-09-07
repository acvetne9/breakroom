-- Rollback Migration for Index Optimization
-- Use this if you need to revert the index optimization changes

-- ============================================================================
-- STEP 1: Drop optimized indexes
-- ============================================================================

-- Businesses table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_businesses_spatial_lookup;
DROP INDEX CONCURRENTLY IF EXISTS idx_businesses_geom_gist;
DROP INDEX CONCURRENTLY IF EXISTS idx_businesses_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_businesses_type_spatial;
DROP INDEX CONCURRENTLY IF EXISTS idx_businesses_geom_spatial;

-- Posts table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_posts_active_user_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_posts_active_business_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_posts_active_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_posts_comments;
DROP INDEX CONCURRENTLY IF EXISTS idx_posts_type_created;

-- Business roles table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_business_roles_lookup;
DROP INDEX CONCURRENTLY IF EXISTS idx_business_roles_role_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_business_roles_unique_lookup;

-- Votes table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_votes_user_post_lookup;
DROP INDEX CONCURRENTLY IF EXISTS idx_votes_post_lookup;

-- Role votes table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_role_votes_user_role_lookup;
DROP INDEX CONCURRENTLY IF EXISTS idx_role_votes_role_lookup;

-- Jobs table indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_current_jobs_profile;
DROP INDEX CONCURRENTLY IF EXISTS idx_current_jobs_business_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_past_jobs_profile_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_past_jobs_business_trgm;

-- ============================================================================
-- STEP 2: Drop helper functions
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_index_usage_stats();
DROP FUNCTION IF EXISTS public.get_missing_indexes_suggestions();

-- ============================================================================
-- STEP 3: Restore basic indexes (if they existed before)
-- ============================================================================

-- Restore simple indexes that might have existed
CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses (name);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_roles_business_id ON business_roles (business_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes (user_id);
CREATE INDEX IF NOT EXISTS idx_votes_post_id ON votes (post_id);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Index optimization rollback complete';
    RAISE NOTICE 'Basic indexes have been restored';
END $$;
