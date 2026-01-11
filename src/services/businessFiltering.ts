import { Business } from '@/types/business';
import { findNeighborhoodBoundaryByName, filterBusinessesByNeighborhood } from '@/utils/nyc_neighborhoods';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import {
  parseBasicSearchTerms,
  parseAdvancedSalaryPatterns,
  parseSalaryToHourly,
  COMMON_ROLES,
  COMMON_BUSINESS_TYPES
} from '@/utils/searchParsing';
import { stripPunctuation } from '@/utils/searchUtils';

export interface SearchFilters {
  textTerms: string[];
  originalTerms?: string[]; // Original search terms (for name/type matching)
  isNeighborhoodSearch?: boolean; // Flag for tiered filtering
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

  // Extract salary patterns first (supports /hr, /mo, /yr formats)
  const { salaryQuery, remainingText } = parseAdvancedSalaryPatterns(searchQuery);
  if (salaryQuery) {
    console.log(`💰 Salary pattern detected: ${salaryQuery.min ? `$${salaryQuery.min.toFixed(2)}/hr` : 'no min'}${salaryQuery.max ? ` - $${salaryQuery.max.toFixed(2)}/hr` : ' or better'}`);
    filters.salaryQuery = salaryQuery;
  }

  // Check for neighborhood in remaining text (after salary removed)
  const neighborhood = findNeighborhoodBoundaryByName(remainingText);
  if (neighborhood) {
    filters.neighborhoodFilter = neighborhood;
    const lats = neighborhood.boundary.map(p => p.lat);
    const lons = neighborhood.boundary.map(p => p.lon);
    filters.neighborhoodFilter.center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
  }

  // Parse remaining text terms (salary already removed)
  const rawTerms = remainingText
    .split(/\s+/)
    .filter((term) => term.length > 0);

  // Strip punctuation for matching
  const textTerms = rawTerms.map((term) => stripPunctuation(term)).filter(t => t.length > 0);

  let filteredTextTerms = textTerms;
  if (neighborhood && textTerms) {
    const neighborhoodNameLower = neighborhood.name.toLowerCase();
    filteredTextTerms = textTerms.filter(term =>
      !neighborhoodNameLower.includes(term.toLowerCase()) &&
      !term.toLowerCase().includes(neighborhoodNameLower)
    );
  }

  let roleFilter = filteredTextTerms?.find(term =>
    COMMON_ROLES.includes(term.toLowerCase())
  );

  let businessTypeFilter = filteredTextTerms?.find(term =>
    COMMON_BUSINESS_TYPES.includes(term.toLowerCase())
  );

  if (roleFilter?.trim()) {
    filters.roleFilter = roleFilter;
  }
  if (businessTypeFilter?.trim()) {
    filters.businessTypeFilter = businessTypeFilter;
  }

  if (textTerms.length > 0) {
    filters.textTerms = textTerms;
    // Also store punctuation-stripped version for tiered filtering
    filters.originalTerms = textTerms; // Already stripped above
  }

  // Set isNeighborhoodSearch flag for tiered filtering
  filters.isNeighborhoodSearch = !!neighborhood;

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

  // Use shared salary parsing utility
  const toHourly = parseSalaryToHourly;

  // Log salary filtering if active
  if (filters.salaryQuery) {
    const { min, max } = filters.salaryQuery;
    console.log(`💰 Salary filter active: ${min ? `$${min.toFixed(2)}/hr` : 'no min'}${max ? ` - $${max.toFixed(2)}/hr` : ' or better'}`);
  }

  const filtered = filteredBusinesses.filter(business => {
    const name = business.name || '';
    const type = business.businessType || '';
    const roles = business.roles || [];

    let hasMatch = false;
    
    if (filters.textTerms && filters.textTerms.length > 0) {
      // Use ORIGINAL terms for matching name and type (if available)
      // Use EXPANDED terms for matching roles
      const termsForNameType = filters.originalTerms || filters.textTerms;
      const termsForRoles = filters.textTerms; // Always use expanded for roles

      hasMatch = termsForNameType.some(term => {
        // Check business name with ORIGINAL term
        if (variantsOf(term).some(v => name.toLowerCase().includes(v))) {
          return true;
        }
        // Check business type with ORIGINAL term
        if (variantsOf(term).some(v => type.toLowerCase().includes(v))) {
          return true;
        }
        return false;
      });

      // If name/type didn't match, check roles with EXPANDED terms
      if (!hasMatch) {
        hasMatch = termsForRoles.some(term => {
          return roles.some(r => variantsOf(term).some(v => (r.role || '').toLowerCase().includes(v)));
        });
      }
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