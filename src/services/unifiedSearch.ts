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
     for (const term of nonRoleTerms) {
       baseQuery = baseQuery.or(`name.ilike.%${term}%,business_type.ilike.%${term}%`);
     }
   }
    
    // Apply business type filter
    if (filters.businessTypeFilter) {
      baseQuery = baseQuery.ilike('business_type', `%${filters.businessTypeFilter}%`);
    }
    
    baseQuery = baseQuery.limit(limit);
    
    const { data: nameMatches, error: nameError } = await baseQuery;
    if (nameError) {
      console.error('❌ Business search error:', nameError);
    }
    
    // Find businesses by matching roles
    let roleMatchedBusinesses: any[] = [];
    if (filters.roleFilter) {
      const { data: roleRows, error: roleSearchError } = await supabase
        .from('business_roles')
        .select('business_id')
        .ilike('role', `%${filters.roleFilter}%`)
        .limit(5000);
      
      if (!roleSearchError && roleRows?.length) {
        const roleBusinessIds = Array.from(new Set(roleRows.map(r => r.business_id)));
        
        if (roleBusinessIds.length > 0) {
          let roleBizQuery = supabase.from('businesses')
            .select('id, name, lat, lng, atmosphere, business_type, website, salary')
            .in('id', roleBusinessIds);
            
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
            for (const term of nonRoleTerms) {
              roleBizQuery = roleBizQuery.or(`name.ilike.%${term}%,business_type.ilike.%${term}%`);
            }
          }
          
          const { data: roleBizData, error: roleBizError } = await roleBizQuery.limit(limit);
          if (!roleBizError) {
            roleMatchedBusinesses = roleBizData || [];
          }
        }
      }
    }
    
    // Combine and dedupe business matches from name/type and role-based searches
    const combinedMap = new Map<string, any>();
    (nameMatches || []).forEach(b => combinedMap.set(b.id, b));
    (roleMatchedBusinesses || []).forEach(b => combinedMap.set(b.id, b));
    const businesses = Array.from(combinedMap.values());
    
    if (!businesses || businesses.length === 0) {
      return [];
    }
    
    console.log(`🔍 Found ${businesses.length} businesses, loading all roles...`);
    
    // Load ALL roles at once for maximum speed - Supabase can handle large IN queries
    const businessIds = businesses.map(b => b.id);
    let allRoles: any[] = [];
    
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('business_roles')
        .select('business_id, id, role, salary, upvotes, downvotes')
        .in('business_id', businessIds);
      
      if (rolesError) {
        console.error('❌ Role loading error:', rolesError);
      } else {
        allRoles = rolesData || [];
        console.log(`✅ Loaded ${allRoles.length} roles for ${businesses.length} businesses`);
      }
    } catch (error) {
      console.error('❌ Role loading failed:', error);
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
    
    // Apply filters efficiently - minimal logging
    const roleMatchedBusinessIds = new Set(roleMatchedBusinesses.map(b => b.id));
    let filteredCount = 0;
    let roleFilteredCount = 0;
    let salaryFilteredCount = 0;
    
    const filteredBusinesses = businessesWithRoles.filter(business => {
      // Role filter - businesses from role search automatically pass
      if (filters.roleFilter) {
        if (roleMatchedBusinessIds.has(business.id)) {
          // Auto-pass: found via role search
        } else {
          // Check if name/type-matched business has the role
          const hasMatchingRole = business.roles?.some(role => 
            role.role.toLowerCase().includes(filters.roleFilter!)
          );
          if (!hasMatchingRole) {
            roleFilteredCount++;
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
          salaryFilteredCount++;
          return false;
        }
      }
      
      filteredCount++;
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
    
    // Single summary log instead of spam
    console.log(`✅ Search completed: ${businesses.length} businesses -> ${filteredBusinesses.length} results (filtered out: ${roleFilteredCount} by role, ${salaryFilteredCount} by salary)`);
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