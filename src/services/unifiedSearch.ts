import { supabase } from "@/integrations/supabase/client";
import { Business } from '@/types/business';
import { applyBusinessFilters, SearchFilters } from './businessFiltering';
import { expandTerm } from '@/utils/smartSearch';

// Search results cache to prevent repeated queries
const searchCache = new Map<string, { results: Business[]; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds
const MAX_CACHE_SIZE = 100;

export interface UnifiedSearchFilters extends SearchFilters {}

// Parse salary strings to hourly rate
const parseSalaryToHourly = (salary: string): number | null => {
  if (!salary) return null;
  
  const numericValue = parseFloat(salary.replace(/[$,]/g, ''));
  if (isNaN(numericValue)) return null;
  
  const salaryLower = salary.toLowerCase();
  
  if (salaryLower.includes('/hr') || salaryLower.includes('hour')) {
    return numericValue;
  } else if (salaryLower.includes('/month') || salaryLower.includes('monthly')) {
    return numericValue / 160; // ~160 hours per month
  } else if (salaryLower.includes('/year') || salaryLower.includes('yearly') || salaryLower.includes('annual')) {
    return numericValue / 2080; // ~2080 hours per year
  }
  
  return numericValue; // Default to hourly
};

// Enhanced search term parsing with better AND logic - NOW ASYNC
export const parseUnifiedSearchFilters = async (searchQuery: string): Promise<UnifiedSearchFilters | null> => {
  if (!searchQuery.trim()) return null;

  const query = searchQuery.toLowerCase().trim();
  
  // Extract salary patterns first
  const salaryPatterns = [
    /\$(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?(\d+(?:\.\d{1,2})?))?\s*(?:\/?\s*(hr|hour|month|year|annual))?/g,
    /(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*(\d+(?:\.\d{1,2})?))?\s*\$?\s*(?:\/?\s*(hr|hour|month|year|annual))/g
  ];
  
  let salaryQuery = null;
  let remainingText = searchQuery;
  
  for (const pattern of salaryPatterns) {
    const match = query.match(pattern);
    if (match) {
      const fullMatch = match[0];
      const parts = fullMatch.match(/(\d+(?:\.\d{1,2})?)/g);
      if (parts) {
        const min = parseFloat(parts[0]);
        const max = parts[1] ? parseFloat(parts[1]) : undefined;
        const unitMatch = fullMatch.match(/(hr|hour|month|year|annual)/);
        const unit = unitMatch ? unitMatch[0] : 'hr';
        
        let minHourly = min;
        let maxHourly = max;
        
        if (unit.includes('month')) {
          minHourly = min / 160;
          maxHourly = max ? max / 160 : undefined;
        } else if (unit.includes('year') || unit.includes('annual')) {
          minHourly = min / 2080;
          maxHourly = max ? max / 2080 : undefined;
        }
        
        salaryQuery = {
          min: minHourly,
          max: maxHourly,
          isRange: !!max
        };
        
        remainingText = remainingText.replace(new RegExp(fullMatch, 'gi'), '').trim();
        break;
      }
    }
  }
  
  // Parse remaining text terms
  const textTerms = remainingText
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => term.toLowerCase());
  
  console.log(`🔍 [parseSearchFilters] Original terms: ${textTerms.join(', ')}`);
  
  // Expand text terms with synonyms - NOW ASYNC with API calls
  const expandedTermsArrays = await Promise.all(
    textTerms.map(term => expandTerm(term))
  );
  const expandedTextTerms = expandedTermsArrays.flat();
  const uniqueExpandedTerms = [...new Set(expandedTextTerms)];
  
  console.log(`🔍 [parseSearchFilters] Expanded to: ${uniqueExpandedTerms.join(', ')}`);
  
  const filters: UnifiedSearchFilters = { textTerms: uniqueExpandedTerms };
  
  if (salaryQuery) filters.salaryQuery = salaryQuery;
  
  console.log('✅ [parseSearchFilters] Final filters:', filters);
  
  return filters;
};

// Efficient database search with chunked role loading
export const searchBusinessesUnified = async (
  filters: UnifiedSearchFilters,
  bounds?: { north: number; south: number; east: number; west: number },
  limit: number = 1000
): Promise<Business[]> => {
  
  const cacheKey = JSON.stringify({ filters, bounds, limit });
  
  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('🚀 Search cache HIT');
    return cached.results;
  }
  
  try {
    // Use database-level text search for comprehensive matching
    let businesses: any[] = [];
    
    // Universal search across ALL fields (name, type, address, roles)
    if (filters.textTerms && filters.textTerms.length > 0) {
      console.log(`🔍 [searchBusinessesUnified] Starting universal search for ${filters.textTerms.length} expanded terms: ${filters.textTerms.join(', ')}`);
      
      // Build search conditions for ALL business fields
      const searchConditions: string[] = [];
      filters.textTerms.forEach(term => {
        searchConditions.push(`name.ilike.%${term}%`);
        searchConditions.push(`business_type.ilike.%${term}%`);
        searchConditions.push(`address.ilike.%${term}%`);
      });
      
      console.log(`🔍 [searchBusinessesUnified] SQL conditions: ${searchConditions.join(' OR ')}`);
      
      // QUERY 1: Search businesses table (name, type, address) in parallel
      const businessSearchPromise = (async () => {
        let textQuery = supabase
          .from('businesses')
          .select('id, name, lat, lng, atmosphere, business_type, website, address');
        
        if (bounds) {
          textQuery = textQuery
            .gte('lat', bounds.south)
            .lte('lat', bounds.north)
            .gte('lng', bounds.west)
            .lte('lng', bounds.east);
        }
        
        textQuery = textQuery.or(searchConditions.join(','));
        const queryLimit = bounds ? Math.min(limit * 10, 10000) : 5000;
        textQuery = textQuery.limit(queryLimit);
        
        const { data, error } = await textQuery;
        if (error) {
          console.error('❌ Business text search error:', error);
          return [];
        }
        console.log(`✅ Business text search found ${data?.length || 0} matches`);
        return data || [];
      })();
      
      // QUERY 2: Search business_roles table (roles) in parallel
      const roleSearchPromise = (async () => {
        const roleConditions = filters.textTerms.map(term => 
          `role.ilike.%${term}%`
        ).join(',');
        
        console.log(`🔍 [searchBusinessesUnified] Role SQL conditions: ${roleConditions}`);
        
        const { data: matchingRoles, error } = await supabase
          .from('business_roles')
          .select('business_id')
          .or(roleConditions)
          .limit(3000);
        
        if (error) {
          console.error('❌ Role search error:', error);
          return [];
        }
        
        if (!matchingRoles || matchingRoles.length === 0) {
          console.log('⚠️ No role matches found');
          return [];
        }
        
        const roleBusinessIds = [...new Set(matchingRoles.map(r => r.business_id))];
        console.log(`✅ Role search found ${roleBusinessIds.length} unique businesses`);
        
        // Fetch businesses from role matches in batches
        const FETCH_BATCH_SIZE = 200;
        const roleBusinesses: any[] = [];
        
        for (let i = 0; i < roleBusinessIds.length; i += FETCH_BATCH_SIZE) {
          const batchIds = roleBusinessIds.slice(i, i + FETCH_BATCH_SIZE);
          
          let query = supabase
            .from('businesses')
            .select('id, name, lat, lng, atmosphere, business_type, website, address')
            .in('id', batchIds);
          
          if (bounds) {
            query = query
              .gte('lat', bounds.south)
              .lte('lat', bounds.north)
              .gte('lng', bounds.west)
              .lte('lng', bounds.east);
          }
          
          const { data } = await query;
          if (data) roleBusinesses.push(...data);
        }
        
        return roleBusinesses;
      })();
      
      // Wait for both queries to complete in parallel
      const [businessMatches, roleMatches] = await Promise.all([
        businessSearchPromise,
        roleSearchPromise
      ]);
      
      // Combine and deduplicate results
      const businessMap = new Map();
      businessMatches.forEach(b => businessMap.set(b.id, b));
      roleMatches.forEach(b => businessMap.set(b.id, b));
      
      businesses = Array.from(businessMap.values());
      console.log(`🔍 Combined search found ${businesses.length} unique businesses (${businessMatches.length} from text, ${roleMatches.length} from roles)`);
      
    } else {
      // No text terms - load businesses based on bounds only
      let baseQuery = supabase
        .from('businesses')
        .select('id, name, lat, lng, atmosphere, business_type, website, address');
      
      if (bounds) {
        baseQuery = baseQuery
          .gte('lat', bounds.south)
          .lte('lat', bounds.north)
          .gte('lng', bounds.west)
          .lte('lng', bounds.east);
      }
      
      const queryLimit = bounds ? Math.min(limit * 10, 10000) : 5000;
      baseQuery = baseQuery.limit(queryLimit);
      
      const { data: allBusinesses } = await baseQuery;
      businesses = allBusinesses || [];
    }
    
    if (businesses.length === 0) {
      console.log('⚠️ No businesses found from universal search');
    }
    
    console.log(`🔍 Found ${businesses.length} businesses, loading all roles...`);
    
    // Load roles in safe batches to avoid oversized URLs
    const businessIds = businesses.map(b => b.id);
    let allRoles: any[] = [];

    if (businessIds.length > 0) {
      const BATCH_SIZE = 150; // keep URL well under limits
      const CONCURRENCY = 6;  // fast but safe parallelism
      const chunks: string[][] = [];
      for (let i = 0; i < businessIds.length; i += BATCH_SIZE) {
        chunks.push(businessIds.slice(i, i + BATCH_SIZE));
      }

      const executeBatch = async (ids: string[]) => {
        const { data, error } = await supabase
          .from('business_roles')
          .select('business_id, id, role, salary, votes_total')
          .in('business_id', ids)
          .order('votes_total', { ascending: false })
          .order('created_at', { ascending: true });
        if (error) {
          console.error('❌ Roles batch error:', error);
          return [] as any[];
        }
        return (data || []) as any[];
      };

      let active = 0;
      let pointer = 0;
      await new Promise<void>((resolve) => {
        const launch = () => {
          if (pointer >= chunks.length) {
            if (active === 0) resolve();
            return;
          }
          const ids = chunks[pointer++];
          active++;
          executeBatch(ids)
            .then((rows) => {
              allRoles.push(...rows);
            })
            .catch((e) => console.error('❌ Roles batch failed:', e))
            .finally(() => {
              active--;
              launch();
            });
        };
        const starters = Math.min(CONCURRENCY, chunks.length);
        for (let i = 0; i < starters; i++) launch();
      });

      console.log(`✅ Loaded ${allRoles.length} roles for ${businesses.length} businesses in ${chunks.length} batches`);
    }
    
    // Only check for empty roles table if no roles loaded and we expected some
    if (allRoles.length === 0 && businesses.length > 0) {
      console.warn('⚠️ No roles loaded for businesses - roles table may be empty');
    }
    
    
    // Combine businesses with their roles
    const businessesWithRoles: Business[] = businesses.map(business => ({
      id: business.id,
      name: business.name,
      position: { lat: business.lat, lng: business.lng },
      atmosphere: business.atmosphere || [],
      businessType: business.business_type,
      website: business.website,
      roles: allRoles
        .filter(role => role.business_id === business.id)
        .map(role => ({
          id: role.id,
          role: role.role,
          salary: role.salary,
          votesTotal: Number(role.votes_total) || 0,
          userVote: null
        }))
    }));
    
    // Apply enhanced business filtering using the centralized logic
    console.log(`🔍 Applying enhanced filters to ${businessesWithRoles.length} businesses...`);
    const filteredBusinesses = applyBusinessFilters(businessesWithRoles, filters as SearchFilters);
    
    // Limit to requested amount
    const finalResults = filteredBusinesses.slice(0, limit);
    
    // Cache results
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, {
      results: finalResults,
      timestamp: Date.now()
    });
    
    // Single summary log instead of spam
    console.log(`✅ Search completed: ${businesses.length} businesses -> ${finalResults.length} results`);
    return finalResults;
    
  } catch (error) {
    console.error('❌ Unified search error:', error);
    return [];
  }
};

// Simple business search by query string
export const searchBusinessesByQuery = async (
  query: string,
  bounds?: { north: number; south: number; east: number; west: number },
  limit: number = 1000
): Promise<Business[]> => {
  
  if (!query.trim()) return [];
  
  const filters = await parseUnifiedSearchFilters(query);
  if (!filters) return [];
  
  return searchBusinessesUnified(filters, bounds, limit);
};

// Clear search cache
export const clearSearchCache = () => {
  searchCache.clear();
  console.log('🧹 Search cache cleared');
};