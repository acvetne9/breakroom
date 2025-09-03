import { supabase } from "@/integrations/supabase/client";

export interface EnhancedBusiness {
  id: string;
  name: string;
  lat: number;
  lng: number;
  position: { lat: number; lng: number };
  atmosphere: string[];
  salary?: string;
  businessType?: string;
  business_type?: string;
  website?: string;
  roles?: Array<{
    id: string;
    role: string;
    salary: string;
    upvotes: number;
    downvotes: number;
    userVote?: 'up' | 'down' | null;
  }>;
  formatted_address?: string;
  vicinity?: string;
}

export interface SearchFilters {
  place?: string;
  role?: string;
  minPay?: number;
  textTerms?: string[];
}

function parseSalaryToNumber(salary: string): number | null {
  if (!salary) return null;
  
  // Remove currency symbols and spaces
  const cleanSalary = salary.replace(/[$,\s]/g, '');
  
  // Check for hourly rates
  if (cleanSalary.includes('/hr') || cleanSalary.includes('hr')) {
    const hourlyRate = parseFloat(cleanSalary.replace(/[^\d.]/g, ''));
    return isNaN(hourlyRate) ? null : hourlyRate;
  }
  
  // Check for monthly rates
  if (cleanSalary.includes('/mo') || cleanSalary.includes('month')) {
    const monthlyRate = parseFloat(cleanSalary.replace(/[^\d.]/g, ''));
    return isNaN(monthlyRate) ? monthlyRate / 160 : null; // ~160 hours per month
  }
  
  // Check for yearly rates
  if (cleanSalary.includes('/yr') || cleanSalary.includes('year') || cleanSalary.includes('k')) {
    let yearlyRate = parseFloat(cleanSalary.replace(/[^\d.]/g, ''));
    if (cleanSalary.includes('k')) {
      yearlyRate *= 1000;
    }
    return isNaN(yearlyRate) ? null : yearlyRate / 2080; // ~2080 hours per year
  }
  
  // Default to hourly if no period specified
  const rate = parseFloat(cleanSalary);
  return isNaN(rate) ? null : rate;
}

function parseSearchQuery(query: string): SearchFilters {
  const filters: SearchFilters = {
    textTerms: []
  };
  
  const words = query.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Check for salary patterns
    if (word.includes('$') || word.includes('pay') || word.includes('salary')) {
      // Look for patterns like "$15", "$15/hr", "pay $20", "salary 50k"
      const salaryMatch = word.match(/\$?(\d+(?:\.\d+)?)[k]?/);
      if (salaryMatch) {
        let amount = parseFloat(salaryMatch[1]);
        if (word.includes('k')) amount *= 1000;
        
        // Convert to hourly rate if it looks like yearly
        if (amount > 100) {
          amount = amount / 2080; // Convert yearly to hourly
        }
        
        filters.minPay = amount;
        continue;
      }
    }
    
    // Add all remaining terms as both potential roles and text terms
    // This allows flexible matching - the database will find matches in both business names and roles
    filters.textTerms?.push(word);
  }
  
  // Use all text terms as potential place search (for business names)
  if (filters.textTerms && filters.textTerms.length > 0) {
    filters.place = filters.textTerms.join(' ');
    // Use individual terms for role search, not the joined string
    // This prevents searching for non-existent roles like "cashier pizza"
    filters.role = filters.textTerms[0]; // Use first term as primary role filter
  }
  
  return filters;
}

export async function searchBusinessesEnhanced(query: string, limit: number = 50): Promise<EnhancedBusiness[]> {
  if (!query.trim()) return [];
  
  const filters = parseSearchQuery(query);
  
  try {
    // Search for businesses that match either name OR roles  
    // First, get businesses that match the name
    const nameResults = filters.place ? await supabase
      .from('businesses')
      .select(`
        id,
        name,
        lat,
        lng,
        atmosphere,
        business_type,
        website,
        business_roles (
          id,
          role,
          salary,
          upvotes,
          downvotes
        )
      `)
      .ilike('name', `%${filters.place}%`)
      .limit(limit) : { data: [] };

    // Then, get businesses that match roles
    const roleResults = filters.role ? await supabase
      .from('businesses')
      .select(`
        id,
        name,
        lat,
        lng,
        atmosphere,
        business_type,
        website,
        business_roles!inner (
          id,
          role,
          salary,
          upvotes,
          downvotes
        )
      `)
      .ilike('business_roles.role', `%${filters.role}%`)
      .limit(limit) : { data: [] };

    // If we have multiple text terms, also search for business type matches
    const businessTypeResults = filters.textTerms && filters.textTerms.length > 1 ? await supabase
      .from('businesses')
      .select(`
        id,
        name,
        lat,
        lng,
        atmosphere,
        business_type,
        website,
        business_roles (
          id,
          role,
          salary,
          upvotes,
          downvotes
        )
      `)
      .ilike('business_type', `%${filters.textTerms.slice(1).join(' ')}%`)
      .limit(limit) : { data: [] };

    // Combine and deduplicate results
    const allBusinesses = new Map();
    
    // Add name matches
    if (nameResults.data) {
      nameResults.data.forEach(business => {
        allBusinesses.set(business.id, business);
      });
    }
    
    // Add role matches
    if (roleResults.data) {
      roleResults.data.forEach(business => {
        allBusinesses.set(business.id, business);
      });
    }

    // Add business type matches
    if (businessTypeResults.data) {
      businessTypeResults.data.forEach(business => {
        allBusinesses.set(business.id, business);
      });
    }

    const data = Array.from(allBusinesses.values());
    
    if (!data || data.length === 0) return [];
    
    // Process and filter by salary if needed
    const processedBusinesses: EnhancedBusiness[] = data.map(business => {
      const roles = Array.isArray(business.business_roles) 
        ? business.business_roles 
        : business.business_roles ? [business.business_roles] : [];
      
      // Filter roles by minimum pay if specified
      let filteredRoles = roles;
      if (filters.minPay) {
        filteredRoles = roles.filter(role => {
          const rolePay = parseSalaryToNumber(role.salary);
          return rolePay !== null && rolePay >= filters.minPay!;
        });
      }
      
      // If we have a pay filter and no roles meet the criteria, exclude this business
      if (filters.minPay && filteredRoles.length === 0) {
        return null;
      }
      
      return {
        id: business.id,
        name: business.name,
        lat: business.lat,
        lng: business.lng,
        position: { lat: business.lat, lng: business.lng },
        atmosphere: business.atmosphere || [],
        businessType: business.business_type || 'Business',
        business_type: business.business_type || 'Business',
        website: business.website,
        roles: filteredRoles.map(role => ({
          id: role.id,
          role: role.role,
          salary: role.salary,
          upvotes: role.upvotes || 0,
          downvotes: role.downvotes || 0,
          userVote: null
        })),
        // Set primary salary from the highest paying role
        salary: filteredRoles.length > 0 
          ? filteredRoles.reduce((highest, current) => {
              const currentPay = parseSalaryToNumber(current.salary) || 0;
              const highestPay = parseSalaryToNumber(highest.salary) || 0;
              return currentPay > highestPay ? current : highest;
            }).salary
          : undefined
      };
    }).filter(business => business !== null) as EnhancedBusiness[];
    
    return processedBusinesses.slice(0, limit);
    
  } catch (error) {
    console.error('Enhanced search error:', error);
    return [];
  }
}