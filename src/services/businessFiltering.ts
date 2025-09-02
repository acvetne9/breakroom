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
  
  // Look for specific role mentions
  const roleFilter = textTerms.find(term => 
    ['barista', 'manager', 'cashier', 'server', 'cook', 'chef', 'waiter', 'host'].includes(term.toLowerCase())
  );
  
  // Look for business type mentions
  const businessTypeFilter = textTerms.find(term => 
    ['restaurant', 'cafe', 'bar', 'store', 'shop', 'hotel', 'gym', 'salon'].includes(term.toLowerCase())
  );

  return {
    textTerms,
    salaryQuery,
    roleFilter,
    businessTypeFilter
  };
}

export function applyBusinessFilters(businesses: Business[], filters: SearchFilters): Business[] {
  if (!filters) return businesses;

  return businesses.filter(business => {
    // Text search across business name and type
    if (filters.textTerms.length > 0) {
      const searchableText = [
        business.name,
        business.businessType,
        ...(business.roles?.map(r => r.role) || [])
      ].join(' ').toLowerCase();
      
      const matchesText = filters.textTerms.every(term => 
        searchableText.includes(term.toLowerCase())
      );
      
      if (!matchesText) return false;
    }
    
    // Role filter
    if (filters.roleFilter) {
      const hasMatchingRole = business.roles?.some(role => 
        role.role.toLowerCase().includes(filters.roleFilter!.toLowerCase())
      );
      if (!hasMatchingRole) return false;
    }
    
    // Business type filter
    if (filters.businessTypeFilter && business.businessType) {
      const matchesType = business.businessType.toLowerCase().includes(
        filters.businessTypeFilter.toLowerCase()
      );
      if (!matchesType) return false;
    }
    
    // Salary filter
    if (filters.salaryQuery && business.roles?.length) {
      const hasMatchingSalary = business.roles.some(role => {
        const salary = parseFloat(role.salary.replace(/[^0-9.]/g, ''));
        if (isNaN(salary)) return false;
        
        if (filters.salaryQuery!.min && salary < filters.salaryQuery!.min) return false;
        if (filters.salaryQuery!.max && salary > filters.salaryQuery!.max) return false;
        
        return true;
      });
      
      if (!hasMatchingSalary) return false;
    }
    
    return true;
  });
}