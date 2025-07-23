
interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  rating: number;
  salary?: string;
  stories?: Array<{ id: string; text: string; author: string }>;
  businessType?: string;
  roles?: Array<{ role: string; salary: string }>;
}

// Helper function to parse salary strings and convert to hourly rate
const parseSalaryToHourly = (salary: string): number | null => {
  if (!salary) return null;
  
  // Remove $ and any non-numeric characters except decimal points
  const numericValue = parseFloat(salary.replace(/[$,]/g, ''));
  if (isNaN(numericValue)) return null;
  
  const salaryLower = salary.toLowerCase();
  
  if (salaryLower.includes('/hr') || salaryLower.includes('hour')) {
    return numericValue;
  } else if (salaryLower.includes('/month') || salaryLower.includes('monthly')) {
    // Assume 160 hours per month (40 hours/week * 4 weeks)
    return numericValue / 160;
  } else if (salaryLower.includes('/year') || salaryLower.includes('yearly') || salaryLower.includes('annual')) {
    // Assume 2080 hours per year (40 hours/week * 52 weeks)
    return numericValue / 2080;
  }
  
  // Default to hourly if no time unit specified
  return numericValue;
};

// Helper function to check if search term is a salary query
const parseSalaryQuery = (searchTerm: string): { min?: number; max?: number; isRange: boolean } | null => {
  const term = searchTerm.toLowerCase().trim();
  
  // Check for salary patterns like "$15", "$15/hr", "$15-20", "$15-$20/hr", etc.
  const salaryPatterns = [
    /\$(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?(\d+(?:\.\d{1,2})?))?\s*(?:\/?\s*(hr|hour|month|year|annual))?/,
    /(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*(\d+(?:\.\d{1,2})?))?\s*\$?\s*(?:\/?\s*(hr|hour|month|year|annual))/
  ];
  
  for (const pattern of salaryPatterns) {
    const match = term.match(pattern);
    if (match) {
      const min = parseFloat(match[1]);
      const max = match[2] ? parseFloat(match[2]) : undefined;
      const unit = match[3] || 'hr'; // default to hourly
      
      let minHourly = min;
      let maxHourly = max;
      
      // Convert to hourly rate based on unit
      if (unit.includes('month')) {
        minHourly = min / 160;
        maxHourly = max ? max / 160 : undefined;
      } else if (unit.includes('year') || unit.includes('annual')) {
        minHourly = min / 2080;
        maxHourly = max ? max / 2080 : undefined;
      }
      
      return {
        min: minHourly,
        max: maxHourly,
        isRange: !!max
      };
    }
  }
  
  return null;
};

export const searchBusinesses = (businesses: Business[], searchTerm: string) => {
  if (!searchTerm.trim()) {
    return { filteredBusinesses: businesses, exactMatch: null };
  }

  const term = searchTerm.toLowerCase().trim();
  
  // Check if this is a salary-based search
  const salaryQuery = parseSalaryQuery(searchTerm);
  
  if (salaryQuery) {
    // Filter by salary
    const filteredBusinesses = businesses.filter(business => {
      // Check main salary
      if (business.salary) {
        const hourlyRate = parseSalaryToHourly(business.salary);
        if (hourlyRate !== null) {
          if (salaryQuery.isRange) {
            return hourlyRate >= salaryQuery.min! && hourlyRate <= salaryQuery.max!;
          } else {
            // Allow +/- $2 tolerance for single value searches
            return Math.abs(hourlyRate - salaryQuery.min!) <= 2;
          }
        }
      }
      
      // Check role salaries
      if (business.roles) {
        return business.roles.some(role => {
          const hourlyRate = parseSalaryToHourly(role.salary);
          if (hourlyRate !== null) {
            if (salaryQuery.isRange) {
              return hourlyRate >= salaryQuery.min! && hourlyRate <= salaryQuery.max!;
            } else {
              return Math.abs(hourlyRate - salaryQuery.min!) <= 2;
            }
          }
          return false;
        });
      }
      
      return false;
    });
    
    return { filteredBusinesses, exactMatch: null };
  }
  
  // Check for exact business name match first
  const exactMatch = businesses.find(business => 
    business.name.toLowerCase() === term
  );
  
  if (exactMatch) {
    return { filteredBusinesses: [exactMatch], exactMatch };
  }
  
  // Filter businesses based on multiple criteria
  const filteredBusinesses = businesses.filter(business => {
    // Check business name
    if (business.name.toLowerCase().includes(term)) {
      return true;
    }
    
    // Check business type
    if (business.businessType?.toLowerCase().includes(term)) {
      return true;
    }
    
    // Check job roles
    if (business.roles?.some(role => 
      role.role.toLowerCase().includes(term)
    )) {
      return true;
    }
    
    return false;
  });
  
  return { filteredBusinesses, exactMatch: null };
};
