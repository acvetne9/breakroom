import { Business } from '@/types/business';
import { findNeighborhoodBoundaryByName, nycNeighborhoodBoundaries, filterBusinessesByNeighborhood } from '@/utils/nyc_neighborhoods';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import { expandTerm } from '@/utils/smartSearch';

// Inline parseSearchTerms function
function parseSearchTerms(query: string): { 
  salaryQuery?: { min?: number; max?: number; isRange: boolean }; 
  textTerms?: string[] 
} {
  const words = query.toLowerCase().split(/\s+/);
  let salaryQuery: { min?: number; max?: number; isRange: boolean } | undefined;
  const textTerms: string[] = [];

  for (const word of words) {
    // Salary patterns: $20, $20-30, 20-30, etc
    if (word.includes('$') || /^\d+(-\d+)?$/.test(word)) {
      const cleaned = word.replace(/\$/g, '');
      if (cleaned.includes('-')) {
        const [min, max] = cleaned.split('-').map(n => parseFloat(n));
        if (!isNaN(min) && !isNaN(max)) {
          salaryQuery = { min, max, isRange: true };
          continue;
        }
      } else {
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          salaryQuery = { min: num, isRange: false };
          continue;
        }
      }
    }
    // Everything else is a text search term
    if (word.length > 1) textTerms.push(word);
  }

  return { salaryQuery, textTerms: textTerms.length > 0 ? textTerms : undefined };
}

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
    const lats = neighborhood.boundary.map(p => p.lat);
    const lons = neighborhood.boundary.map(p => p.lon);
    filters.neighborhoodFilter.center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
  }
  
  const { salaryQuery, textTerms } = parseSearchTerms(searchQuery);
  
  let filteredTextTerms = textTerms;
  if (neighborhood && textTerms) {
    const neighborhoodNameLower = neighborhood.name.toLowerCase();
    filteredTextTerms = textTerms.filter(term => 
      !neighborhoodNameLower.includes(term.toLowerCase()) && 
      !term.toLowerCase().includes(neighborhoodNameLower)
    );
  }
  
  const commonRoles = [
    'barista','manager','cashier','server','cook','chef','waiter','waitress','host','hostess',
    'bartender','barback','line cook','dishwasher','assistant','supervisor','lead','team',
    'crew','staff','associate','representative','agent','coordinator','specialist','technician',
    'receptionist','secretary','clerk','sales','service','customer','food','kitchen','front',
    'back','house','floor','delivery','driver','cleaner','maintenance', 'intern', 'trainee'
  ];
  
  const commonBusinessTypes = [
    'restaurant','restaurants','cafe','cafes','coffee','shop','shops','bar','bars','store','stores',
    'hotel','hotels','gym','gyms','salon','salons','bakery','bakeries','deli','delis','market',
    'office','clinic','hospital','bank','retail','fast','food','chain','franchise','boutique'
  ];
  
  let roleFilter = filteredTextTerms?.find(term => 
    commonRoles.includes(term.toLowerCase())
  );
  
  let businessTypeFilter = filteredTextTerms?.find(term =>
    commonBusinessTypes.includes(term.toLowerCase())
  );

  if (salaryQuery) {
    filters.salaryQuery = salaryQuery;
  }
  if (roleFilter?.trim()) {
    filters.roleFilter = roleFilter;
  }
  if (businessTypeFilter?.trim()) {
    filters.businessTypeFilter = businessTypeFilter;
  }
  if (neighborhood) {
    filters.neighborhoodFilter = neighborhood;
  }

  const originalTerms = parseSearchTerms(searchQuery).textTerms || [];
  if (originalTerms.length > 0) {
    filters.textTerms = originalTerms;
  }

  console.log('🔍 [parseSearchFilters] Final filters:', filters);

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

  const matchesTermVariantsSync = (haystack: string, term: string) => {
    const h = normalize(haystack);
    const variants = variantsOf(term);
    return variants.some(v => h.includes(v));
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

    // COMPREHENSIVE SEARCH: Check ALL text terms across ALL searchable fields
    // Any term matching ANY field (name, type, roles) will include the business
    let hasMatch = false;
    
    if (filters.textTerms && filters.textTerms.length > 0) {
      hasMatch = filters.textTerms.some(term => {
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
    }

    // INCLUSIVE OR-based matching for specific filters when they overlap with text terms
    // This prevents over-filtering when the same search term creates multiple filter types
    if (filters.roleFilter && !hasMatch) {
      hasMatch = roles.some(r => {
        return matchesTermVariantsSync(r.role || '', filters.roleFilter!);
      });
    }

    if (filters.businessTypeFilter && !hasMatch) {
      hasMatch = matchesTermVariantsSync(type, filters.businessTypeFilter!);
    }

    // If no match found from text/role/type searches, exclude
    if (!hasMatch && (filters.textTerms?.length || filters.roleFilter || filters.businessTypeFilter)) {
      return false;
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

      if (!roleSalaryMatch) return false;
    }

    return true;
  });

  console.log(`🔍 applyBusinessFilters result: ${businesses.length} -> ${filtered.length} businesses`);
  return filtered;
}