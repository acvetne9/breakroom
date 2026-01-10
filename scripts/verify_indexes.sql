-- Quick verification queries
-- Run these after applying the index optimization migration
-- in Supabase SQL Editor

-- ============================================================================
-- 1. Check all new indexes were created
-- ============================================================================

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS index_size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Expected: Should see ~25 indexes including idx_businesses_spatial_lookup,
-- idx_posts_active_user_created, idx_votes_user_post_lookup, etc.

-- ============================================================================
-- 2. Check index usage statistics
-- ============================================================================

SELECT * FROM get_index_usage_stats()
ORDER BY index_scans DESC
LIMIT 20;

-- Expected: New indexes will show 0 scans initially, but will grow as queries run

-- ============================================================================
-- 3. Check for any missing indexes
-- ============================================================================

SELECT * FROM get_missing_indexes_suggestions();

-- Expected: Should show very few or no suggestions after optimization

-- ============================================================================
-- 4. Verify key queries use the new indexes (EXPLAIN only, doesn't execute)
-- ============================================================================

-- Test 1: Active posts query (should use idx_posts_active_created)
EXPLAIN (COSTS OFF)
SELECT * FROM posts
WHERE is_deleted = false
ORDER BY created_at DESC
LIMIT 20;
-- Expected: Index Scan using idx_posts_active_created

-- Test 2: Spatial query (should use idx_businesses_spatial_lookup)
EXPLAIN (COSTS OFF)
SELECT * FROM businesses
WHERE lat >= 40.7 AND lat <= 40.8
  AND lng >= -74.0 AND lng <= -73.9;
-- Expected: Index Scan using idx_businesses_spatial_lookup

-- Test 3: Business roles query (should use idx_business_roles_lookup)
-- Note: Replace with a real business_id from your database
EXPLAIN (COSTS OFF)
SELECT * FROM business_roles
WHERE business_id = (SELECT id FROM businesses LIMIT 1)
ORDER BY votes_total DESC, created_at ASC;
-- Expected: Index Scan using idx_business_roles_lookup

-- Test 4: User votes query (should use idx_votes_user_post_lookup)
-- Note: Replace with a real user_id from your database
EXPLAIN (COSTS OFF)
SELECT * FROM votes
WHERE user_id = (SELECT DISTINCT user_id FROM votes LIMIT 1)
  AND post_id IN (SELECT id FROM posts LIMIT 3);
-- Expected: Index Scan using idx_votes_user_post_lookup

-- Test 5: Business name search (should use idx_businesses_name_trgm)
EXPLAIN (COSTS OFF)
SELECT * FROM businesses
WHERE name ILIKE '%coffee%';
-- Expected: Bitmap Index Scan on idx_businesses_name_trgm

-- ============================================================================
-- 5. Table statistics (should be up-to-date after migration)
-- ============================================================================

SELECT
    schemaname || '.' || relname AS table_name,
    n_live_tup AS row_count,
    n_dead_tup AS dead_rows,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Expected: last_analyze or last_autoanalyze should be recent

-- ============================================================================
-- 6. Overall database size after optimization
-- ============================================================================

SELECT
    pg_size_pretty(pg_database_size(current_database())) AS total_size,
    (SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid)))
     FROM pg_stat_user_indexes
     WHERE schemaname = 'public') AS total_index_size;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
    index_count integer;
    total_size text;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE 'idx_%';

    SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) INTO total_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public';

    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Index Optimization Verification Summary';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Total optimized indexes: %', index_count;
    RAISE NOTICE 'Total index size: %', total_size;
    RAISE NOTICE 'Monitoring functions available:';
    RAISE NOTICE '  - get_index_usage_stats()';
    RAISE NOTICE '  - get_missing_indexes_suggestions()';
    RAISE NOTICE '==============================================';
END $$;
