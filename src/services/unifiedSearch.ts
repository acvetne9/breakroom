import { supabase } from "@/integrations/supabase/client";
import { Business } from '@/types/business';

// Search results cache to prevent repeated queries
const searchCache = new Map<string, { results: Business[]; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds
const MAX_CACHE_SIZE = 100;

export interface UnifiedSearchFilters {
  textTerms: string[];
  roleFilter?: string;
  businessTypeFilter?: string;
  salaryQuery?: {
    min?: number;
    max?: number;
    isRange: boolean;
  };
}

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
    let baseQuery = supabase.from('businesses').select(`
      id, name, lat, lng, atmosphere, business_type, website, salary
    `);
    
    // Apply geographic bounds if specified
    if (bounds) {
      baseQuery = baseQuery
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east);
    }
    
   // Apply text search on business name/type (filtering out role terms)
   const nonRoleTerms = filters.textTerms.filter(term => term !== filters.roleFilter);
   if (nonRoleTerms.length > 0) {
     console.log(`🔍 [unifiedSearch] Searching business names and types for terms: ${JSON.stringify(nonRoleTerms)}`);
     for (const term of nonRoleTerms) {
       baseQuery = baseQuery.or(`name.ilike.%${term}%,business_type.ilike.%${term}%`);
     }
   }
    
    // Apply business type filter
    if (filters.businessTypeFilter) {
      console.log(`🔍 [unifiedSearch] Applying business type filter: ${filters.businessTypeFilter}`);
      baseQuery = baseQuery.ilike('business_type', `%${filters.businessTypeFilter}%`);
    }
    
    baseQuery = baseQuery.limit(limit);
    
    console.log(`🔍 [unifiedSearch] Executing query with filters:`, filters);
    const { data: nameMatches, error: nameError } = await baseQuery;
    if (nameError) {
      console.error('❌ Business search error:', nameError);
    }
    console.log(`🔍 [unifiedSearch] Raw business query (name/type) returned ${nameMatches?.length || 0} results`);
    
    // Find businesses by matching roles
    let roleMatchedBusinesses: any[] = [];
    if (filters.roleFilter) {
      console.log('🔍 [unifiedSearch] Searching roles for:', filters.roleFilter);
      const { data: roleRows, error: roleSearchError } = await supabase
        .from('business_roles')
        .select('business_id')
        .ilike('role', `%${filters.roleFilter}%`)
        .limit(5000);
      if (roleSearchError) {
        console.warn('⚠️ Role search error:', roleSearchError);
      }
      const roleBusinessIds = Array.from(new Set((roleRows || []).map(r => r.business_id)));
      console.log(`🔍 [unifiedSearch] Role search matched ${roleBusinessIds.length} unique businesses`);
      if (roleBusinessIds.length > 0) {
        let roleBizQuery = supabase.from('businesses').select('id, name, lat, lng, atmosphere, business_type, website, salary').in('id', roleBusinessIds);
        if (bounds) {
          roleBizQuery = roleBizQuery
            .gte('lat', bounds.south)
            .lte('lat', bounds.north)
            .gte('lng', bounds.west)
            .lte('lng', bounds.east);
        }
        
        // Apply non-role text terms to role-matched businesses
        const nonRoleTerms = filters.textTerms.filter(term => term !== filters.roleFilter);
        if (nonRoleTerms.length > 0) {
          console.log(`🔍 [unifiedSearch] Applying non-role terms to role-matched businesses: ${JSON.stringify(nonRoleTerms)}`);
          for (const term of nonRoleTerms) {
            roleBizQuery = roleBizQuery.or(`name.ilike.%${term}%,business_type.ilike.%${term}%`);
          }
        }
        
        const { data: roleBizData, error: roleBizError } = await roleBizQuery.limit(limit);
        if (roleBizError) {
          console.warn('⚠️ Role-matched businesses fetch error:', roleBizError);
        }
        roleMatchedBusinesses = roleBizData || [];
        console.log(`🔍 [unifiedSearch] Role-matched businesses within bounds: ${roleMatchedBusinesses.length}`);
      }
    }
    
    // Combine and dedupe business matches from name/type and role-based searches
    const combinedMap = new Map<string, any>();
    (nameMatches || []).forEach(b => combinedMap.set(b.id, b));
    (roleMatchedBusinesses || []).forEach(b => combinedMap.set(b.id, b));
    const businesses = Array.from(combinedMap.values());
    
    if (!businesses || businesses.length === 0) {
      console.log('🔍 [unifiedSearch] No businesses found after name/type and role-based matching');
      return [];
    }
    
    console.log(`🔍 Found ${businesses.length} businesses, now loading roles...`);
    console.log(`🔍 Business IDs to load roles for:`, businesses.slice(0, 5).map(b => ({ id: b.id, name: b.name })));
    
    // Load roles for all businesses efficiently in chunks
    const businessIds = businesses.map(b => b.id);
    const allRoles: any[] = [];
    
    // Chunk business IDs to avoid URL length limits
    const chunkSize = 50; // Conservative chunk size
    for (let i = 0; i < businessIds.length; i += chunkSize) {
      const chunk = businessIds.slice(i, i + chunkSize);
      console.log(`🔍 Loading roles for chunk ${i / chunkSize + 1}, business IDs:`, chunk.slice(0, 3));
      
      try {
        const { data: rolesData, error: rolesError } = await supabase
          .from('business_roles')
          .select('business_id, id, role, salary, upvotes, downvotes')
          .in('business_id', chunk);
        
        if (rolesError) {
          console.error('❌ Role loading error:', rolesError);
        } else {
          console.log(`🔍 Chunk ${i / chunkSize + 1} returned ${rolesData?.length || 0} roles`);
          if (rolesData && rolesData.length > 0) {
            allRoles.push(...rolesData);
            console.log(`🔍 Sample roles from chunk:`, rolesData.slice(0, 3).map(r => ({ businessId: r.business_id, role: r.role, salary: r.salary })));
          }
        }
      } catch (chunkError) {
        console.error('❌ Role chunk failed:', chunkError);
      }
    }
    
    console.log(`🔍 Loaded ${allRoles.length} roles total`);
    
    // If no roles loaded, check if business_roles table exists and has data
    if (allRoles.length === 0) {
      console.log('⚠️ No roles loaded - checking business_roles table...');
      try {
        const { data: sampleRoles, error: sampleError } = await supabase
          .from('business_roles')
          .select('business_id, role, salary')
          .limit(10);
        
        if (sampleError) {
          console.error('❌ Error checking business_roles table:', sampleError);
        } else {
          console.log('🔍 Sample roles from business_roles table:', sampleRoles);
          if (sampleRoles && sampleRoles.length === 0) {
            console.error('❌ CRITICAL: business_roles table is empty - no role data exists in database!');
          }
        }
      } catch (error) {
        console.error('❌ Failed to check business_roles table:', error);
      }
    }
    
    // Combine businesses with their roles
    const businessesWithRoles: Business[] = businesses.map(business => ({
      id: business.id,
      name: business.name,
      position: { lat: business.lat, lng: business.lng },
      atmosphere: business.atmosphere || [],
      salary: business.salary,
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
    
    // Apply filters with AND logic
    console.log(`🔍 [unifiedSearch] Applying role/salary filters to ${businessesWithRoles.length} businesses`);
    
    // Track which businesses came from role search to avoid double-filtering
    const roleMatchedBusinessIds = new Set(roleMatchedBusinesses.map(b => b.id));
    
    const filteredBusinesses = businessesWithRoles.filter(business => {
      // Role filter - must match if specified  
      if (filters.roleFilter) {
        // If this business came from role search, it already passes
        if (roleMatchedBusinessIds.has(business.id)) {
          console.log(`🔍 [unifiedSearch] Business "${business.name}" auto-passed: found via role search`);
          return true; // Early return for role-matched businesses
        } else {
          // For businesses found via name/type search, check if they have matching roles
          const hasMatchingRole = business.roles?.some(role => 
            role.role.toLowerCase().includes(filters.roleFilter!)
          );
          if (!hasMatchingRole) {
            console.log(`🔍 [unifiedSearch] Business "${business.name}" filtered out: no matching role for "${filters.roleFilter}"`);
            return false;
          }
        }
      }
      
      // Salary filter - must match if specified
      if (filters.salaryQuery) {
        const { min, max, isRange } = filters.salaryQuery;
        
        const hasMatchingSalary = business.roles?.some(role => {
          const hourlyRate = parseSalaryToHourly(role.salary);
          if (hourlyRate === null) return false;
          
          if (isRange) {
            return hourlyRate >= min! && hourlyRate <= max!;
          } else {
            // Allow +/- $2 tolerance for single value
            return Math.abs(hourlyRate - min!) <= 2;
          }
        });
        
        if (!hasMatchingSalary) {
          console.log(`🔍 [unifiedSearch] Business "${business.name}" filtered out: no matching salary for query`);
          return false;
        }
      }
      
      return true;
    });
    
    // Cache results
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, {
      results: filteredBusinesses,
      timestamp: Date.now()
    });
    
    console.log(`✅ Search completed: ${businesses.length} -> ${filteredBusinesses.length} businesses`);
    return filteredBusinesses;
    
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