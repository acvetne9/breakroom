import { supabase } from '@/integrations/supabase/client';

/**
 * Database query optimization utilities
 * Provides caching, performance monitoring, and query batching
 */

// Performance monitoring
interface QueryMetrics {
  queryName: string;
  duration: number;
  timestamp: number;
  cacheHit: boolean;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_METRICS = 100;

/**
 * Log query performance for monitoring
 */
export const logQueryPerformance = (
  queryName: string,
  duration: number,
  cacheHit: boolean = false
) => {
  const metric: QueryMetrics = {
    queryName,
    duration,
    timestamp: Date.now(),
    cacheHit,
  };

  queryMetrics.push(metric);

  // Keep only last 100 metrics
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.shift();
  }

  // Log slow queries (> 1 second)
  if (duration > 1000) {
    console.warn(`🐌 Slow query detected: ${queryName} took ${duration}ms`);
  }
};

/**
 * Get query performance analytics
 */
export const getQueryAnalytics = () => {
  if (queryMetrics.length === 0) {
    return null;
  }

  const totalQueries = queryMetrics.length;
  const cacheHits = queryMetrics.filter((m) => m.cacheHit).length;
  const averageDuration =
    queryMetrics.reduce((sum, m) => sum + m.duration, 0) / totalQueries;
  const slowQueries = queryMetrics.filter((m) => m.duration > 1000);

  return {
    totalQueries,
    cacheHitRate: ((cacheHits / totalQueries) * 100).toFixed(2) + '%',
    averageDuration: averageDuration.toFixed(2) + 'ms',
    slowQueries: slowQueries.map((q) => ({
      name: q.queryName,
      duration: q.duration + 'ms',
    })),
  };
};

// Query result caching
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly maxSize = 100; // Maximum cache entries

  set<T>(key: string, data: T, ttl: number = 60000) {
    // Default 60s TTL
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string) {
    // Invalidate all keys matching pattern (e.g., "posts:*")
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern.replace('*', ''))) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const queryCache = new QueryCache();

/**
 * Execute a query with automatic caching and performance monitoring
 */
export async function executeQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  options: {
    cacheKey?: string;
    cacheTTL?: number; // milliseconds
    skipCache?: boolean;
  } = {}
): Promise<T> {
  const startTime = performance.now();
  const { cacheKey, cacheTTL = 60000, skipCache = false } = options;

  // Check cache if enabled
  if (cacheKey && !skipCache) {
    const cached = queryCache.get<T>(cacheKey);
    if (cached !== null) {
      const duration = performance.now() - startTime;
      logQueryPerformance(queryName, duration, true);
      console.log(`✅ Cache hit for ${queryName}`);
      return cached;
    }
  }

  // Execute query
  try {
    const result = await queryFn();
    const duration = performance.now() - startTime;

    // Cache result if enabled
    if (cacheKey && !skipCache) {
      queryCache.set(cacheKey, result, cacheTTL);
    }

    logQueryPerformance(queryName, duration, false);
    console.log(`✅ ${queryName} completed in ${duration.toFixed(2)}ms`);

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    logQueryPerformance(queryName, duration, false);
    console.error(`❌ ${queryName} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Batch multiple queries and execute them in parallel
 */
export async function batchQueries<T extends any[]>(
  queries: Array<{
    name: string;
    fn: () => Promise<any>;
    cacheKey?: string;
    cacheTTL?: number;
  }>
): Promise<T> {
  console.log(`🔄 Executing ${queries.length} queries in parallel...`);

  const startTime = performance.now();

  const results = await Promise.all(
    queries.map((query) =>
      executeQuery(query.name, query.fn, {
        cacheKey: query.cacheKey,
        cacheTTL: query.cacheTTL,
      })
    )
  );

  const duration = performance.now() - startTime;
  console.log(`✅ Batch completed in ${duration.toFixed(2)}ms`);

  return results as T;
}

/**
 * Helper to create cache keys
 */
export const createCacheKey = (prefix: string, params: Record<string, any>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${prefix}:${sortedParams}`;
};

/**
 * Supabase query builder with automatic optimization
 */
export class OptimizedQuery {
  /**
   * Select only the fields you need (avoid SELECT *)
   */
  static selectMinimal<T>(
    table: string,
    fields: string[],
    filter?: (query: any) => any
  ): Promise<{ data: T[] | null; error: any }> {
    const fieldList = fields.join(', ');
    let query = supabase.from(table).select(fieldList);

    if (filter) {
      query = filter(query);
    }

    return query;
  }

  /**
   * Use .maybeSingle() instead of .single() to avoid errors on no results
   */
  static async getSingle<T>(
    table: string,
    id: string,
    idField: string = 'id'
  ): Promise<T | null> {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(idField, id)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      return null;
    }

    return data;
  }

  /**
   * Paginated query with efficient range-based pagination
   */
  static async paginate<T>(
    table: string,
    options: {
      page: number;
      pageSize: number;
      orderBy?: string;
      ascending?: boolean;
      filter?: (query: any) => any;
    }
  ): Promise<{ data: T[]; hasMore: boolean; total?: number }> {
    const { page, pageSize, orderBy = 'created_at', ascending = false, filter } = options;

    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from(table).select('*', { count: 'exact' });

    if (filter) {
      query = filter(query);
    }

    query = query.order(orderBy, { ascending }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Pagination error:', error);
      return { data: [], hasMore: false };
    }

    return {
      data: data || [],
      hasMore: count ? to < count - 1 : false,
      total: count || 0,
    };
  }
}

/**
 * Common query optimizations
 */
export const QueryOptimizations = {
  /**
   * Prefetch related data to avoid N+1 queries
   * Use JOIN or select with relations instead of multiple queries
   */
  avoidN1Queries: `
    Example:
    // BAD: N+1 queries
    const posts = await supabase.from('posts').select('*');
    for (const post of posts) {
      const business = await supabase.from('businesses').select('*').eq('id', post.business_id);
    }

    // GOOD: Single query with join
    const posts = await supabase.from('posts').select('*, businesses(*)');
  `,

  /**
   * Use indexes for frequently filtered columns
   */
  suggestedIndexes: [
    'CREATE INDEX idx_posts_user_id ON posts(user_id)',
    'CREATE INDEX idx_posts_business_id ON posts(business_id)',
    'CREATE INDEX idx_posts_created_at ON posts(created_at DESC)',
    'CREATE INDEX idx_businesses_lat_lng ON businesses(lat, lng)',
    'CREATE INDEX idx_role_votes_user_id ON role_votes(user_id)',
    'CREATE INDEX idx_role_votes_business_role_id ON role_votes(business_role_id)',
  ],

  /**
   * Use .limit() to prevent loading too much data
   */
  alwaysLimit: 'Always add .limit() to queries to prevent accidentally loading entire tables',

  /**
   * Use .maybeSingle() instead of .single() when record might not exist
   */
  useMaybeSingle:
    "Use .maybeSingle() instead of .single() to return null instead of throwing error when no record found",
};
