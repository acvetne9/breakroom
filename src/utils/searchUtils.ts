
interface Business {
  id: string;
  name: string;
  position: { lat: number; lng: number };
  atmosphere: string[];
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

// Parse search terms into salary and text components
export const parseSearchTerms = (searchTerm: string): { salaryQuery: { min?: number; max?: number; isRange: boolean } | null; textTerms: string[] } => {
  const term = searchTerm.toLowerCase().trim();
  
  // Check for salary patterns like "$15", "$15/hr", "$15-20", "$15-$20/hr", etc.
  const salaryPatterns = [
    /\$(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?(\d+(?:\.\d{1,2})?))?\s*(?:\/?\s*(hr|hour|month|year|annual))?/g,
    /(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*(\d+(?:\.\d{1,2})?))?\s*\$?\s*(?:\/?\s*(hr|hour|month|year|annual))/g
  ];
  
  let salaryQuery = null;
  let remainingText = searchTerm;
  
  for (const pattern of salaryPatterns) {
    const match = term.match(pattern);
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
        
        // Convert to hourly rate based on unit
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
        
        // Remove salary pattern from search text
        remainingText = remainingText.replace(new RegExp(fullMatch, 'gi'), '').trim();
        break;
      }
    }
  }
  
  // Split remaining text into search terms
  const textTerms = remainingText
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => term.toLowerCase());
  
  return { salaryQuery, textTerms };
};

// Check if business matches salary criteria
const matchesSalaryCriteria = (business: Business, salaryQuery: { min?: number; max?: number; isRange: boolean }): boolean => {
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
};

// Check if business matches text criteria
const matchesTextCriteria = (business: Business, textTerms: string[]): boolean => {
  if (textTerms.length === 0) return true;
  
  const businessText = [
    business.name.toLowerCase(),
    business.businessType?.toLowerCase() || '',
    ...(business.roles?.map(role => role.role.toLowerCase()) || [])
  ].join(' ');
  
  // All text terms must match (AND logic)
  return textTerms.every(term => businessText.includes(term));
};

export const searchBusinesses = (businesses: Business[], searchTerm: string) => {
  if (!searchTerm.trim()) {
    return { filteredBusinesses: businesses, exactMatch: null };
  }

  const term = searchTerm.toLowerCase().trim();
  
  // Parse search terms into salary and text components
  const { salaryQuery, textTerms } = parseSearchTerms(searchTerm);
  
  // Check for exact business name match first (only if no salary query)
  if (!salaryQuery && textTerms.length === 1) {
    const exactMatch = businesses.find(business => 
      business.name.toLowerCase() === term
    );
    
    if (exactMatch) {
      return { filteredBusinesses: [exactMatch], exactMatch };
    }
  }
  
  // Filter businesses based on multiple criteria (AND logic)
  const filteredBusinesses = businesses.filter(business => {
    // Must match salary criteria if specified
    if (salaryQuery && !matchesSalaryCriteria(business, salaryQuery)) {
      return false;
    }
    
    // Must match text criteria if specified
    if (!matchesTextCriteria(business, textTerms)) {
      return false;
    }
    
    return true;
  });
  
  return { filteredBusinesses, exactMatch: null };
};
