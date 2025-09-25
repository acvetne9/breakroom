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

  console.log('🔍 [parseSearchFilters] Final filters:', filters);

  // Return null if no meaningful filters (only empty textTerms)
  if ((!filteredTextTerms || filteredTextTerms.length === 0) && !salaryQuery && !roleFilter && !businessTypeFilter && !neighborhood) {
    console.log('🔍 [parseSearchFilters] No meaningful filters found, returning null');
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

    // Text terms across name, type, and roles with plural handling
    if (filters.textTerms && filters.textTerms.length > 0) {
      const allTermsMatch = filters.textTerms.every(term =>
        variantsOf(term).some(v => searchableText.includes(v))
      );
      if (!allTermsMatch) return false;
    }

    // Role filter - also check if any text terms match roles when no specific roleFilter
    if (filters.roleFilter) {
      console.log('🔍 [roleFilter] Checking business:', business.name, 'for role:', filters.roleFilter);
      console.log('🔍 [roleFilter] Business roles:', roles.map(r => r.role));
      
      const roleMatch = roles.some(r => {
        const match = matchesTermVariants(r.role || '', filters.roleFilter!);
        console.log('🔍 [roleFilter] Role:', r.role, 'vs filter:', filters.roleFilter, 'match:', match);
        return match;
      });
      
      console.log('🔍 [roleFilter] Final roleMatch for', business.name + ':', roleMatch);
      if (!roleMatch) return false;
    } else if (filters.textTerms && filters.textTerms.length > 0) {
      // If no specific role filter but we have text terms, check if any match roles
      const hasRoleMatch = filters.textTerms.some(term =>
        roles.some(r => matchesTermVariants(r.role || '', term))
      );
      // Don't filter out if roles match any text terms - let other filters handle it
    }

    // Business type filter
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