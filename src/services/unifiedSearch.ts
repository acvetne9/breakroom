import { supabase } from "@/integrations/supabase/client";
import { Business } from '@/types/business';
import { applyBusinessFilters, SearchFilters } from './businessFiltering';

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

// Enhanced search term parsing with better AND logic
export const parseUnifiedSearchFilters = (searchQuery: string): UnifiedSearchFilters | null => {
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
  
  // Categorize terms
  const commonRoles = [
    'barista','manager','cashier','server','cook','chef','waiter','waitress','host','hostess',
    'bartender','barback','line cook','dishwasher','assistant','supervisor','lead','team',
    'crew','staff','associate','representative','agent','coordinator','specialist','technician',
    'receptionist','secretary','clerk','sales','service','customer','food','kitchen','front',
    'back','house','floor','delivery','driver','cleaner','maintenance','intern','trainee'
  ];
  
  const commonBusinessTypes = [
    'restaurant','restaurants','cafe','cafes','coffee','shop','shops','bar','bars','store','stores',
    'hotel','hotels','gym','gyms','salon','salons','bakery','bakeries','deli','delis','market',
    'office','clinic','hospital','bank','retail','fast','food','chain','franchise','boutique'
  ];
  
  let roleFilter = textTerms.find(term => commonRoles.includes(term));
  let businessTypeFilter = textTerms.find(term => commonBusinessTypes.includes(term));
  
  const filters: UnifiedSearchFilters = { textTerms };
  
  if (salaryQuery) filters.salaryQuery = salaryQuery;
  if (roleFilter) filters.roleFilter = roleFilter;
  if (businessTypeFilter) filters.businessTypeFilter = businessTypeFilter;
  
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
    // Load basic businesses from database with minimal filtering
    // (we'll apply the full filtering logic later using applyBusinessFilters)
    let baseQuery = supabase.from('businesses').select(`
      id, name, lat, lng, atmosphere, business_type, website
    `);
    
    // Apply geographic bounds if specified
    if (bounds) {
      baseQuery = baseQuery
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east);
    }
    
    // For keyword search, we'll load more businesses and filter them with applyBusinessFilters
    // This ensures consistent filtering logic across the app
    baseQuery = baseQuery.limit(Math.min(limit * 3, 10000)); // Load more for filtering
    
    const { data: businesses, error: businessError } = await baseQuery;
    if (businessError) {
      console.error('❌ Business search error:', businessError);
      return [];
    }
    
    if (!businesses || businesses.length === 0) {
      return [];
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
          .select('business_id, id, role, salary, upvotes, downvotes')
          .in('business_id', ids);
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
          upvotes: role.upvotes || 0,
          downvotes: role.downvotes || 0,
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
  
  const filters = parseUnifiedSearchFilters(query);
  if (!filters) return [];
  
  return searchBusinessesUnified(filters, bounds, limit);
};

// Clear search cache
export const clearSearchCache = () => {
  searchCache.clear();
  console.log('🧹 Search cache cleared');
};