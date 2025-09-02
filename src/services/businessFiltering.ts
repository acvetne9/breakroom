import { Business } from '@/types/business';
import { parseSearchTerms } from '@/utils/searchUtils';

export interface SearchFilters {
  textTerms: string[];
  salaryQuery?: {
    min?: number;
    max?: number;
    isRange: boolean;
  };
  roleFilter?: string;
  businessTypeFilter?: string;
}

export function parseSearchFilters(searchQuery: string): SearchFilters | null {
  if (!searchQuery.trim()) return null;

  const { salaryQuery, textTerms } = parseSearchTerms(searchQuery);
  
  // Look for specific role mentions (expanded, includes plural variations)
  const roleFilter = textTerms.find(term => 
    [
      'barista','manager','cashier','server','cook','chef','waiter','waitress','host','hostess','bartender','barback','line cook','dishwasher'
    ].includes(term.toLowerCase())
  );
  
  // Look for business type mentions (expanded with plurals/synonyms)
  const businessTypeFilter = textTerms.find(term =>
    [
      'restaurant','restaurants','cafe','cafes','coffee','coffee shop','bar','bars','store','stores','shop','shops','hotel','hotels','gym','gyms','salon','salons','bakery','bakeries','deli','delis'
    ].includes(term.toLowerCase())
  );

  const filters: SearchFilters = {
    textTerms: textTerms || []
  };

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

  // Return null if no meaningful filters (only empty textTerms)
  if ((!textTerms || textTerms.length === 0) && !salaryQuery && !roleFilter && !businessTypeFilter) {
    return null;
  }

  return filters;
}

export function applyBusinessFilters(businesses: Business[], filters: SearchFilters): Business[] {
  if (!filters) return businesses;

  console.log('🔍 applyBusinessFilters called with:', businesses.length, 'businesses and filters:', filters);

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

  const filtered = businesses.filter(business => {
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

    // Role filter
    if (filters.roleFilter) {
      const roleMatch = roles.some(r => matchesTermVariants(r.role || '', filters.roleFilter!));
      if (!roleMatch) return false;
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