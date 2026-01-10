-- Database Index Optimization Migration
-- This migration optimizes indexes based on actual query patterns
-- Preserves all functionality while improving performance

-- ============================================================================
-- STEP 1: Analyze and document current indexes
-- ============================================================================

-- Create a temporary table to store current index information for reference
CREATE TEMP TABLE IF NOT EXISTS current_indexes AS
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- STEP 2: Drop redundant or suboptimal indexes
-- ============================================================================

-- Drop indexes that will be replaced with more efficient ones
-- Note: This uses IF EXISTS to avoid errors if indexes don't exist

-- Businesses table - drop if exists before recreating optimally
DROP INDEX IF EXISTS idx_businesses_name;
DROP INDEX IF EXISTS idx_businesses_lat;
DROP INDEX IF EXISTS idx_businesses_lng;
DROP INDEX IF EXISTS idx_businesses_created_at;

-- Posts table - drop if exists before recreating
DROP INDEX IF EXISTS idx_posts_user_id;
DROP INDEX IF EXISTS idx_posts_business_id;
DROP INDEX IF EXISTS idx_posts_created_at;
DROP INDEX IF EXISTS idx_posts_is_deleted;

-- Business roles table - drop if exists
DROP INDEX IF EXISTS idx_business_roles_business_id;
DROP INDEX IF EXISTS idx_business_roles_votes;
DROP INDEX IF EXISTS idx_business_roles_created_at;

-- Votes tables - drop if exists
DROP INDEX IF EXISTS idx_votes_user_id;
DROP INDEX IF EXISTS idx_votes_post_id;
DROP INDEX IF EXISTS idx_role_votes_user_id;
DROP INDEX IF EXISTS idx_role_votes_business_role_id;

-- Jobs tables - drop if exists
DROP INDEX IF EXISTS idx_current_jobs_profile_id;
DROP INDEX IF EXISTS idx_past_jobs_profile_id;

-- Profiles table - drop if exists
DROP INDEX IF EXISTS idx_profiles_id;

-- ============================================================================
-- STEP 3: Create optimized indexes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BUSINESSES TABLE
-- ----------------------------------------------------------------------------

-- Composite index for spatial queries (lat/lng range queries are very common)
-- This supports queries like: WHERE lat >= ? AND lat <= ? AND lng >= ? AND lng <= ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_spatial_lookup
ON businesses (lat, lng)
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- GIST index for PostGIS geometry queries (if using geom column)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_geom_gist
ON businesses USING GIST (geom)
WHERE geom IS NOT NULL;

-- Text search index for business name (supports ILIKE queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_name_trgm
ON businesses USING gin (name gin_trgm_ops);

-- Composite index for common filtering + spatial
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_type_spatial
ON businesses (business_type, lat, lng)
WHERE business_type IS NOT NULL;

-- ----------------------------------------------------------------------------
-- POSTS TABLE
-- ----------------------------------------------------------------------------

-- Composite index for filtering non-deleted posts by user, ordered by created_at
-- This supports: WHERE is_deleted = false AND user_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_active_user_created
ON posts (user_id, created_at DESC)
WHERE is_deleted = false;

-- Index for filtering posts by business
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_active_business_created
ON posts (business_id, created_at DESC)
WHERE is_deleted = false AND business_id IS NOT NULL;

-- Index for general active posts (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_active_created
ON posts (created_at DESC)
WHERE is_deleted = false;

-- Index for finding comments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_comments
ON posts (is_comment, created_at DESC)
WHERE is_comment IS NOT NULL AND is_deleted = false;

-- Index for post type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_type_created
ON posts (post_type, created_at DESC)
WHERE is_deleted = false;

-- ----------------------------------------------------------------------------
-- BUSINESS_ROLES TABLE
-- ----------------------------------------------------------------------------

-- Composite index for business roles ordered by votes and creation time
-- This supports: WHERE business_id = ? ORDER BY votes_total DESC, created_at ASC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_roles_lookup
ON business_roles (business_id, votes_total DESC NULLS LAST, created_at ASC);

-- Index for role search (supports ILIKE on role field)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_roles_role_trgm
ON business_roles USING gin (role gin_trgm_ops);

-- Index for finding unique role/salary combinations (used in createOrUpdateBusinessRole)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_roles_unique_lookup
ON business_roles (business_id, role, salary);

-- ----------------------------------------------------------------------------
-- VOTES TABLE
-- ----------------------------------------------------------------------------

-- Composite index for user vote lookups
-- This supports: WHERE user_id = ? AND post_id IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_user_post_lookup
ON votes (user_id, post_id);

-- Reverse index for finding all votes on a post
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_post_lookup
ON votes (post_id, vote_type);

-- ----------------------------------------------------------------------------
-- ROLE_VOTES TABLE
-- ----------------------------------------------------------------------------

-- Composite index for user vote lookups on business roles
-- This supports: WHERE user_id = ? AND business_role_id IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_votes_user_role_lookup
ON role_votes (user_id, business_role_id);

-- Reverse index for finding all votes on a role
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_votes_role_lookup
ON role_votes (business_role_id, vote_type);

-- ----------------------------------------------------------------------------
-- CURRENT_JOBS TABLE
-- ----------------------------------------------------------------------------

-- Index for profile lookups (uses maybeSingle(), so must be efficient)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_current_jobs_profile
ON current_jobs (profile_id);

-- Index for searching by business name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_current_jobs_business_trgm
ON current_jobs USING gin (business_name gin_trgm_ops)
WHERE business_name IS NOT NULL;

-- ----------------------------------------------------------------------------
-- PAST_JOBS TABLE
-- ----------------------------------------------------------------------------

-- Composite index for profile jobs ordered by date
-- This supports: WHERE profile_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_jobs_profile_created
ON past_jobs (profile_id, created_at DESC);

-- Index for searching by business name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_jobs_business_trgm
ON past_jobs USING gin (business_name gin_trgm_ops)
WHERE business_name IS NOT NULL;

-- ----------------------------------------------------------------------------
-- PROFILES TABLE
-- ----------------------------------------------------------------------------

-- Primary key already provides index on id, no additional index needed
-- But ensure it exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'profiles' AND indexname = 'profiles_pkey'
    ) THEN
        ALTER TABLE profiles ADD PRIMARY KEY (id);
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create supporting indexes for RPC functions
-- ============================================================================

-- Index to support get_businesses_with_roles_and_votes_near_point RPC
-- This RPC uses ST_DWithin for spatial queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_geom_spatial
ON businesses USING GIST (geom);

-- ============================================================================
-- STEP 5: Update table statistics for query planner
-- ============================================================================

-- Analyze tables to update statistics
ANALYZE businesses;
ANALYZE business_roles;
ANALYZE posts;
ANALYZE votes;
ANALYZE role_votes;
ANALYZE current_jobs;
ANALYZE past_jobs;
ANALYZE profiles;

-- ============================================================================
-- STEP 6: Create helper function to monitor index usage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_index_usage_stats()
RETURNS TABLE (
    table_name text,
    index_name text,
    index_scans bigint,
    tuples_read bigint,
    tuples_fetched bigint,
    index_size text,
    usage_percentage numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        schemaname || '.' || tablename AS table_name,
        indexrelname AS index_name,
        idx_scan AS index_scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
        ROUND(
            100.0 * idx_scan / NULLIF(
                (SELECT SUM(idx_scan) FROM pg_stat_user_indexes WHERE schemaname = 'public'),
                0
            ),
            2
        ) AS usage_percentage
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: Create function to identify missing indexes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_missing_indexes_suggestions()
RETURNS TABLE (
    table_name text,
    query_count bigint,
    suggested_columns text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        schemaname || '.' || relname AS table_name,
        seq_scan AS query_count,
        'Consider adding index on frequently filtered columns' AS suggested_columns
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND seq_scan > 1000  -- Tables with many sequential scans
    AND seq_scan > idx_scan  -- More sequential scans than index scans
    ORDER BY seq_scan DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Log the optimization completion
DO $$
DECLARE
    index_count integer;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public';

    RAISE NOTICE 'Index optimization complete. Total indexes: %', index_count;
    RAISE NOTICE 'Run SELECT * FROM get_index_usage_stats() to monitor index performance';
    RAISE NOTICE 'Run SELECT * FROM get_missing_indexes_suggestions() to find optimization opportunities';
END $$;
