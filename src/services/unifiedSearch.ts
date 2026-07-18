import { supabase } from "@/integrations/supabase/client";
import { Business } from "@/types/business";
import { applyBusinessFilters, SearchFilters } from "./businessFiltering";
import { expandTerm } from "@/utils/smartSearch";
import { sanitizeVoteTotal } from "@/utils/voteCalculations";
import { findNeighborhoodBoundaryByName } from "@/utils/nyc_neighborhoods";
import { parseAdvancedSalaryPatterns } from "@/utils/searchParsing";
import { retryWithBackoff, isRetryableError } from "@/utils/retryWithBackoff";
import { stripPunctuation } from "@/utils/searchUtils";

// Search results cache to prevent repeated queries
const searchCache = new Map<string, { results: Business[]; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds
const MAX_CACHE_SIZE = 100;

export interface UnifiedSearchFilters extends SearchFilters {}

/**
 * Widen a parsed filter's role terms with synonyms (via DataMuse) for broader role
 * matching. Keeps `originalTerms` (used for name/type/address matching) and every other
 * field intact — it only expands `textTerms` (used for role matching).
 *
 * Shared by the dropdown parser below AND the map path (HomePage) so both match roles
 * with the same breadth. This is the single source of truth for term expansion.
 */
export const expandFilterTerms = async <T extends SearchFilters>(filters: T): Promise<T> => {
  const baseTerms =
    filters.originalTerms && filters.originalTerms.length > 0
      ? filters.originalTerms
      : filters.textTerms;

  if (!baseTerms || baseTerms.length === 0) return filters;

  const MAX_TOTAL_TERMS = 20; // Prevent overly broad searches
  const expandedTermsArrays = await Promise.all(
    baseTerms.map(async (term) => {
      // Skip expansion for neighborhood names
      if (findNeighborhoodBoundaryByName(term)) return [term];
      // Limit expansions per term to top 5 most relevant
      const expanded = await expandTerm(term);
      return expanded.slice(0, 5);
    }),
  );

  const uniqueExpandedTerms = [...new Set(expandedTermsArrays.flat())].slice(0, MAX_TOTAL_TERMS);

  return { ...filters, textTerms: uniqueExpandedTerms, originalTerms: baseTerms };
};

// Parse a raw query into filters for the search service (universal text + role search).
export const parseUnifiedSearchFilters = async (searchQuery: string): Promise<UnifiedSearchFilters | null> => {
  if (!searchQuery.trim()) return null;

  // Extract salary patterns using shared utility
  const { salaryQuery, remainingText } = parseAdvancedSalaryPatterns(searchQuery);

  // Parse remaining text terms and strip punctuation
  const originalTerms = remainingText
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => stripPunctuation(term))
    .filter((t) => t.length > 0);

  const isNeighborhoodSearch = originalTerms.some((term) => findNeighborhoodBoundaryByName(term));

  const base: UnifiedSearchFilters = {
    textTerms: originalTerms,
    originalTerms,
    isNeighborhoodSearch,
  };
  if (salaryQuery) base.salaryQuery = salaryQuery;

  // Widen role matching with synonyms (shared with the map path)
  return expandFilterTerms(base);
};

// Efficient database search with chunked role loading
export const searchBusinessesUnified = async (
  filters: UnifiedSearchFilters,
  bounds?: { north: number; south: number; east: number; west: number },
  limit: number = 1000,
  options?: { loadRoles?: boolean },
): Promise<Business[]> => {
  // Roles are only needed when we actually render or score them (map display + salary
  // filtering). The typeahead dropdown skips role loading to avoid dozens of extra
  // round trips per keystroke. Salary searches always need roles regardless.
  const shouldLoadRoles = (options?.loadRoles ?? true) || !!filters.salaryQuery;
  const cacheKey = JSON.stringify({ filters, bounds, limit, shouldLoadRoles });

  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("🚀 Search cache HIT");
    return cached.results;
  }

  try {
    // Use database-level text search for comprehensive matching
    let businesses: any[] = [];

    // Universal search across ALL fields (name, type, address, roles)
    if (
      (filters.textTerms && filters.textTerms.length > 0) ||
      (filters.originalTerms && filters.originalTerms.length > 0)
    ) {
      console.log(
        `🔍 [searchBusinessesUnified] Starting universal search for ${filters.textTerms.length} expanded terms: ${filters.textTerms.join(", ")}`,
      );

      // Build search conditions - ONLY use original terms for business metadata
      // (expanded terms are used only for role searches below)
      const searchConditions: string[] = [];

      // Use ONLY original terms for name/type/address search (no expansion noise)
      if (filters.originalTerms && filters.originalTerms.length > 0) {
        filters.originalTerms.forEach((term) => {
          searchConditions.push(`name.ilike.%${term}%`);
          searchConditions.push(`business_type.ilike.%${term}%`);
          searchConditions.push(`address.ilike.%${term}%`);
        });
      }

      console.log(`🔍 [searchBusinessesUnified] SQL conditions: ${searchConditions.join(" OR ")}`);

      // QUERY 1: Search businesses table (name, type, address) in parallel
      const businessSearchPromise = (async () => {
        let textQuery = supabase
          .from("businesses")
          .select("id, name, lat, lng, atmosphere, business_type, website, address");

        if (bounds) {
          textQuery = textQuery
            .gte("lat", bounds.south)
            .lte("lat", bounds.north)
            .gte("lng", bounds.west)
            .lte("lng", bounds.east);
        }

        textQuery = textQuery.or(searchConditions.join(","));
        const queryLimit = bounds ? Math.min(limit * 10, 10000) : 5000;
        textQuery = textQuery.limit(queryLimit);

        const { data, error } = await retryWithBackoff(
          () => textQuery,
          { shouldRetry: isRetryableError }
        );
        if (error) {
          console.error("❌ Business text search error:", error);
          return [];
        }
        console.log(`✅ Business text search found ${data?.length || 0} matches`);
        return data || [];
      })();

      // QUERY 2: Search business_roles table (roles) in parallel
      const roleSearchPromise = (async () => {
        const roleConditions = filters.textTerms.map((term) => `role.ilike.%${term}%`).join(",");

        console.log(`🔍 [searchBusinessesUnified] Role SQL conditions: ${roleConditions}`);

        const { data: matchingRoles, error } = await retryWithBackoff(
          () => supabase
            .from("business_roles")
            .select("business_id")
            .or(roleConditions)
            .limit(3000),
          { shouldRetry: isRetryableError }
        );

        if (error) {
          console.error("❌ Role search error:", error);
          return [];
        }

        if (!matchingRoles || matchingRoles.length === 0) {
          console.log("⚠️ No role matches found");
          return [];
        }

        const roleBusinessIds = [...new Set(matchingRoles.map((r) => r.business_id))];
        console.log(`✅ Role search found ${roleBusinessIds.length} unique businesses`);

        // Fetch businesses from role matches in batches
        const FETCH_BATCH_SIZE = 200;
        const roleBusinesses: any[] = [];

        for (let i = 0; i < roleBusinessIds.length; i += FETCH_BATCH_SIZE) {
          const batchIds = roleBusinessIds.slice(i, i + FETCH_BATCH_SIZE);

          let query = supabase
            .from("businesses")
            .select("id, name, lat, lng, atmosphere, business_type, website, address")
            .in("id", batchIds);

          if (bounds) {
            query = query
              .gte("lat", bounds.south)
              .lte("lat", bounds.north)
              .gte("lng", bounds.west)
              .lte("lng", bounds.east);
          }

          const { data } = await retryWithBackoff(
            () => query,
            { shouldRetry: isRetryableError }
          );
          if (data) roleBusinesses.push(...data);
        }

        return roleBusinesses;
      })();

      // Wait for both queries to complete in parallel
      const [businessMatches, roleMatches] = await Promise.all([businessSearchPromise, roleSearchPromise]);

      // Combine and deduplicate results
      const businessMap = new Map();
      businessMatches.forEach((b) => businessMap.set(b.id, b));
      roleMatches.forEach((b) => businessMap.set(b.id, b));

      businesses = Array.from(businessMap.values());
      console.log(
        `🔍 Combined search found ${businesses.length} unique businesses (${businessMatches.length} from text, ${roleMatches.length} from roles)`,
      );
    } else {
      // No text terms - load businesses based on bounds only
      let baseQuery = supabase
        .from("businesses")
        .select("id, name, lat, lng, atmosphere, business_type, website, address");

      if (bounds) {
        baseQuery = baseQuery
          .gte("lat", bounds.south)
          .lte("lat", bounds.north)
          .gte("lng", bounds.west)
          .lte("lng", bounds.east);
      }

      const queryLimit = bounds ? Math.min(limit * 10, 10000) : 5000;
      baseQuery = baseQuery.limit(queryLimit);

      const { data: allBusinesses } = await baseQuery;
      businesses = allBusinesses || [];
    }

    if (businesses.length === 0) {
      console.log("⚠️ No businesses found from universal search");
    }

    console.log(`🔍 Found ${businesses.length} businesses, loading all roles...`);

    // Load roles in safe batches with optimized parallelism
    const businessIds = businesses.map((b) => b.id);
    let allRoles: any[] = [];

    if (businessIds.length > 0 && shouldLoadRoles) {
      const BATCH_SIZE = 200; // Optimized batch size for better URL utilization
      const CONCURRENCY = 8; // Increased parallelism for faster loading
      const chunks: string[][] = [];
      for (let i = 0; i < businessIds.length; i += BATCH_SIZE) {
        chunks.push(businessIds.slice(i, i + BATCH_SIZE));
      }

      // Use Promise.all for cleaner parallel execution
      const batchPromises = chunks.map((chunk, index) =>
        // Stagger batches to avoid overwhelming the server
        new Promise<any[]>((resolve) => {
          setTimeout(async () => {
            try {
              const { data, error } = await supabase
                .from("business_roles")
                .select("business_id, id, role, salary, votes_total")
                .in("business_id", chunk)
                .order("votes_total", { ascending: false })
                .order("created_at", { ascending: true });

              if (error) {
                console.error("❌ Roles batch error:", error);
                resolve([]);
              } else {
                resolve(data || []);
              }
            } catch (e) {
              console.error("❌ Roles batch failed:", e);
              resolve([]);
            }
          }, Math.floor(index / CONCURRENCY) * 50); // 50ms stagger per concurrency group
        })
      );

      const results = await Promise.all(batchPromises);
      allRoles = results.flat();

      console.log(`✅ Loaded ${allRoles.length} roles for ${businesses.length} businesses in ${chunks.length} batches`);
    }

    // Only check for empty roles table if no roles loaded and we expected some
    if (allRoles.length === 0 && businesses.length > 0) {
      console.warn("⚠️ No roles loaded for businesses - roles table may be empty");
    }

    const businessesWithRoles: Business[] = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      position: { lat: business.lat, lng: business.lng },
      atmosphere: business.atmosphere || [],
      businessType: business.business_type,
      website: business.website,
      address: business.address,
      roles: allRoles
        .filter((role) => role.business_id === business.id)
        .map((role) => ({
          id: role.id,
          role: role.role,
          salary: role.salary,
          votesTotal: sanitizeVoteTotal(role.votes_total),
          userVote: null,
        })),
    }));

    // Calculate relevance score for each business
    console.log(`🎯 Scoring ${businessesWithRoles.length} businesses for relevance...`);
    const scoredBusinesses = businessesWithRoles.map((business) => {
      let score = 0;
      const nameLower = business.name.toLowerCase();
      const typeLower = (business.businessType || "").toLowerCase();
      const originalTermsLower = (filters.originalTerms || filters.textTerms).map((t) => t.toLowerCase());
      const searchQueryNormalized = originalTermsLower.join(" ");

      // HIGHEST PRIORITY: Exact full name match (case-insensitive)
      if (nameLower === searchQueryNormalized) {
        score += 1000;
      }

      // HIGH PRIORITY: Name contains all original terms as complete words
      const nameWords = nameLower.split(/\s+/);
      const allTermsInName = originalTermsLower.every((term) =>
        nameWords.some((word) => word === term || word.includes(term)),
      );
      if (allTermsInName && score < 1000) {
        score += 500;
      }

      // MEDIUM-HIGH: Name starts with first search term
      if (originalTermsLower.length > 0 && nameLower.startsWith(originalTermsLower[0])) {
        score += 200;
      }

      // MEDIUM: Count how many original terms match in name
      originalTermsLower.forEach((term) => {
        if (nameLower.includes(term)) {
          score += 50;
        }
      });

      // MEDIUM: Count how many original terms match in business type
      originalTermsLower.forEach((term) => {
        if (typeLower.includes(term)) {
          score += 30;
        }
      });

      // LOW: Matches only through expanded terms (less relevant)
      const expandedOnlyTerms = (filters.textTerms || []).filter((t) => !originalTermsLower.includes(t.toLowerCase()));
      expandedOnlyTerms.forEach((term) => {
        if (nameLower.includes(term.toLowerCase())) {
          score += 10;
        }
      });

      // BONUS: Has roles matching search terms
      if (business.roles && business.roles.length > 0) {
        const roleMatches = business.roles.some((role) =>
          originalTermsLower.some((term) => (role.role || "").toLowerCase().includes(term)),
        );
        if (roleMatches) score += 20;
      }

      return { business, score };
    });

    // Filter by minimum score threshold to remove irrelevant results
    const MINIMUM_SCORE = 30; // Filters out weak/expanded-only matches
    const relevantBusinesses = scoredBusinesses.filter(item => item.score >= MINIMUM_SCORE);

    console.log(
      `🎯 Filtered ${scoredBusinesses.length} -> ${relevantBusinesses.length} businesses (min score: ${MINIMUM_SCORE})`
    );

    // Sort by score (highest first)
    const sortedBusinesses = relevantBusinesses.sort((a, b) => b.score - a.score).map((item) => item.business);

    console.log(
      `🎯 Top 5 scored results:`,
      sortedBusinesses.slice(0, 5).map((b) => ({
        name: b.name,
        score: relevantBusinesses.find((sb) => sb.business.id === b.id)?.score,
      })),
    );

    // Apply enhanced business filtering to sorted results
    console.log(`🔍 Applying enhanced filters to ${sortedBusinesses.length} businesses...`);
    const filteredBusinesses = applyBusinessFilters(sortedBusinesses, filters as SearchFilters);

    // Limit to requested amount
    const finalResults = filteredBusinesses.slice(0, limit);

    // Cache results
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, {
      results: finalResults,
      timestamp: Date.now(),
    });

    // Single summary log instead of spam
    console.log(`✅ Search completed: ${businesses.length} businesses -> ${finalResults.length} results`);
    return finalResults;
  } catch (error) {
    console.error("❌ Unified search error:", error);
    return [];
  }
};

// Simple business search by query string
export const searchBusinessesByQuery = async (
  query: string,
  bounds?: { north: number; south: number; east: number; west: number },
  limit: number = 1000,
  options?: { loadRoles?: boolean },
): Promise<Business[]> => {
  if (!query.trim()) return [];

  const filters = await parseUnifiedSearchFilters(query);
  if (!filters) return [];

  return searchBusinessesUnified(filters, bounds, limit, options);
};

// Clear search cache
export const clearSearchCache = () => {
  searchCache.clear();
  console.log("🧹 Search cache cleared");
};
