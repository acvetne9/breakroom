import { Business } from '@/types/business';
import { parseSearchTerms } from '@/utils/searchUtils';
import { findNeighborhoodBoundaryByName, nycNeighborhoodBoundaries, filterBusinessesByNeighborhood } from '@/utils/nyc_neighborhoods';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';

export interface SearchFilters {
  textTerms: string[];
  salaryQuery?: {
    min?: number;
    max?: number;
    isRange: boolean;
  };
  roleFilter?: string;
  businessTypeFilter?: string;
  neighborhoodFilter?: NeighborhoodBounds;
}

export function parseSearchFilters(searchQuery: string): SearchFilters | null {
  console.log('🔍 [parseSearchFilters] Input query:', searchQuery);
  
  if (!searchQuery.trim()) return null;

  let filters: SearchFilters = {
    textTerms: []
  };

  // Check for neighborhood first
  const neighborhood = findNeighborhoodBoundaryByName(searchQuery);
  if (neighborhood) {
    filters.neighborhoodFilter = neighborhood;

    // Add center for map panning
    const lats = neighborhood.boundary.map(p => p.lat);
    const lons = neighborhood.boundary.map(p => p.lon);
    filters.neighborhoodFilter.center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
  }
  
  const { salaryQuery, textTerms } = parseSearchTerms(searchQuery);
  console.log('🔍 [parseSearchFilters] Parsed terms - salaryQuery:', salaryQuery, 'textTerms:', textTerms);
  
  // If we found a neighborhood, remove the neighborhood name from text terms
  // so we don't require businesses to have the neighborhood name in their title
  let filteredTextTerms = textTerms;
  if (neighborhood && textTerms) {
    const neighborhoodNameLower = neighborhood.name.toLowerCase();
    filteredTextTerms = textTerms.filter(term => 
      !neighborhoodNameLower.includes(term.toLowerCase()) && 
      !term.toLowerCase().includes(neighborhoodNameLower)
    );
    console.log('🏙️ [parseSearchFilters] Removed neighborhood name from text terms:', textTerms, '->', filteredTextTerms);
  }
  
  // Common role keywords - expanded list but more inclusive approach
  const commonRoles = [
    'barista','manager','cashier','server','cook','chef','waiter','waitress','host','hostess',
    'bartender','barback','line cook','dishwasher','assistant','supervisor','lead','team',
    'crew','staff','associate','representative','agent','coordinator','specialist','technician',
    'receptionist','secretary','clerk','sales','service','customer','food','kitchen','front',
    'back','house','floor','delivery','driver','cleaner','maintenance', 'intern', 'trainee'
  ];
  
  console.log('🔍 [parseSearchFilters] Checking if any text terms match role keywords');
  console.log('🔍 [parseSearchFilters] Text terms:', filteredTextTerms);
  console.log('🔍 [parseSearchFilters] Available role keywords:', commonRoles.slice(0, 10), '...');
  
  // Business type keywords - expanded list
  const commonBusinessTypes = [
    'restaurant','restaurants','cafe','cafes','coffee','shop','shops','bar','bars','store','stores',
    'hotel','hotels','gym','gyms','salon','salons','bakery','bakeries','deli','delis','market',
    'office','clinic','hospital','bank','retail','fast','food','chain','franchise','boutique'
  ];
  
  // Instead of only checking hardcoded lists, also include any term as potential role/business type
  // This allows flexible matching while still prioritizing known terms
  let roleFilter = filteredTextTerms.find(term => 
    commonRoles.includes(term.toLowerCase())
  );
  
  // Only use terms that explicitly match known roles
  
  let businessTypeFilter = filteredTextTerms.find(term =>
    commonBusinessTypes.includes(term.toLowerCase())
  );

  console.log('🔍 [parseSearchFilters] Role filter found:', roleFilter);
  console.log('🔍 [parseSearchFilters] Business type filter found:', businessTypeFilter);
  if (neighborhood) {
    console.log('🏙️ [parseSearchFilters] Neighborhood found:', neighborhood.name, 'in', neighborhood.borough);
  }

  // Only add optional filters if they have values (no undefined)
  if (salaryQuery) {
    filters.salaryQuery = salaryQuery;
  }
  if (roleFilter && roleFilter.trim()) {
    filters.roleFilter = roleFilter;
  }
  if (businessTypeFilter && businessTypeFilter.trim()) {
    filters.businessTypeFilter = businessTypeFilter;
  }
  if (neighborhood) {
    filters.neighborhoodFilter = neighborhood;
  }

  // ALWAYS include the original search terms for comprehensive search
  // This ensures we search across ALL categories: name, type, roles, etc.
  const originalTerms = parseSearchTerms(searchQuery).textTerms || [];
  if (originalTerms && originalTerms.length > 0) {
    filters.textTerms = originalTerms; // Use original terms, not filtered ones
  }

  console.log('🔍 [parseSearchFilters] Final filters (comprehensive search):', filters);

  // Return null only if completely empty search
  if (!searchQuery.trim()) {
    console.log('🔍 [parseSearchFilters] Empty search, returning null');
    return null;
  }

  return filters;
}

export function applyBusinessFilters(businesses: Business[], filters: SearchFilters): Business[] {
  if (!filters) return businesses;

  console.log('🔍 [applyBusinessFilters] Called with:', businesses.length, 'businesses and filters:', filters);
  
  // Apply neighborhood filter first (most restrictive)
  let filteredBusinesses = businesses;
  if (filters.neighborhoodFilter) {
    console.log('🏙️ Filtering by neighborhood:', filters.neighborhoodFilter.name);
    filteredBusinesses = filterBusinessesByNeighborhood(filteredBusinesses, filters.neighborhoodFilter);
    console.log('🏙️ Businesses in neighborhood:', filteredBusinesses.length);
  }
  
  // Sample roles with full detail for debugging
  const sampleRoles = filteredBusinesses.slice(0, 3).map(b => ({ 
    name: b.name, 
    rolesCount: b.roles?.length || 0, 
    roles: b.roles?.map(r => ({ role: r.role, salary: r.salary })) || [] 
  }));
  console.log('🔍 [applyBusinessFilters] Sample business roles (detailed):', sampleRoles);

  const normalize = (s: string) => s?.toLowerCase().trim();
  const variantsOf = (term: string) => {
    const t = normalize(term);
    const variants = new Set<string>([t]);
    if (t.endsWith('ies')) variants.add(t.slice(0, -3) + 'y');
    if (t.endsWith('s')) variants.add(t.slice(0, -1));
    variants.add(t + 's');
    return Array.from(variants);
  };

  const matchesTermVariants = (haystack: string, term: string) => {
    const h = normalize(haystack);
    return variantsOf(term).some(v => h.includes(v));
  };

  const toHourly = (salary: string): number | null => {
    if (!salary) return null;
    const s = salary.toLowerCase();
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return null;
    if (s.includes('/hr') || s.includes('hour')) return num;
    if (s.includes('/mo') || s.includes('month')) return Math.round(num / 173);
    if (s.includes('/yr') || s.includes('/year') || s.includes('year') || s.includes('annual')) return Math.round(num / 2080);
    return num; // assume hourly if unit missing
  };

  const filtered = filteredBusinesses.filter(business => {
    const name = business.name || '';
    const type = business.businessType || '';
    const roles = business.roles || [];

    const searchableText = [name, type, ...roles.map(r => r.role || '')].join(' ').toLowerCase();

    // COMPREHENSIVE SEARCH: Check ALL text terms across ALL searchable fields
    // Any term matching ANY field (name, type, roles) will include the business
    if (filters.textTerms && filters.textTerms.length > 0) {
      const hasAnyMatch = filters.textTerms.some(term => {
        // Check business name
        if (variantsOf(term).some(v => name.toLowerCase().includes(v))) {
          return true;
        }
        // Check business type
        if (variantsOf(term).some(v => type.toLowerCase().includes(v))) {
          return true;
        }
        // Check roles
        if (roles.some(r => variantsOf(term).some(v => (r.role || '').toLowerCase().includes(v)))) {
          return true;
        }
        return false;
      });
      if (!hasAnyMatch) return false;
    }

    // Additional specific filters (these are AND conditions with the comprehensive search above)
    // Role filter - only apply if specifically identified as a role search
    if (filters.roleFilter) {
      const roleMatch = roles.some(r => {
        return matchesTermVariants(r.role || '', filters.roleFilter!);
      });
      if (!roleMatch) return false;
    }

    // Business type filter - only apply if specifically identified as a business type search
    if (filters.businessTypeFilter) {
      const typeMatch = matchesTermVariants(type, filters.businessTypeFilter!);
      if (!typeMatch) return false;
    }

    // Salary filter: check roles first, then top-level salary as fallback
    if (filters.salaryQuery) {
      const { min, max } = filters.salaryQuery;

      const roleSalaryMatch = roles.some(r => {
        const hourly = toHourly(r.salary || '');
        if (hourly == null || isNaN(hourly)) return false;
        if (min != null && hourly < min) return false;
        if (max != null && hourly > max) return false;
        return true;
      });

      let topLevelSalaryMatch = false;
      if (!roleSalaryMatch && business.salary) {
        const topHourly = toHourly(business.salary || '');
        if (topHourly != null && !isNaN(topHourly)) {
          if ((min == null || topHourly >= min) && (max == null || topHourly <= max)) {
            topLevelSalaryMatch = true;
          }
        }
      }

      if (!roleSalaryMatch && !topLevelSalaryMatch) return false;
    }

    return true;
  });

  console.log(`🔍 applyBusinessFilters result: ${businesses.length} -> ${filtered.length} businesses`);
  return filtered;
}