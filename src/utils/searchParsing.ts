// Shared utility for parsing search terms and salary queries
// Used by both client-side and server-side search filters

export interface SalaryQuery {
  min?: number;
  max?: number;
  isRange: boolean;
}

export interface ParsedSearchTerms {
  salaryQuery?: SalaryQuery;
  textTerms?: string[];
}

/**
 * Parse salary to hourly rate from various formats
 * Handles: /hr, /hour, /month, /monthly, /year, /yearly, annual
 */
export const parseSalaryToHourly = (salary: string): number | null => {
  if (!salary) return null;

  const numericValue = parseFloat(salary.replace(/[$,]/g, ""));
  if (isNaN(numericValue)) return null;

  const salaryLower = salary.toLowerCase();

  if (salaryLower.includes("/hr") || salaryLower.includes("hour")) {
    return numericValue;
  } else if (salaryLower.includes("/mo") || salaryLower.includes("month")) {
    return Math.round(numericValue / 173); // ~173 hours per month (more accurate)
  } else if (
    salaryLower.includes("/yr") ||
    salaryLower.includes("/year") ||
    salaryLower.includes("year") ||
    salaryLower.includes("annual")
  ) {
    return Math.round(numericValue / 2080); // ~2080 hours per year
  }

  return numericValue; // Default to hourly
};

/**
 * Parse basic search terms to extract salary patterns and text terms
 * Handles patterns like: $20, $20-30, 20-30, etc.
 */
export const parseBasicSearchTerms = (query: string): ParsedSearchTerms => {
  const words = query.toLowerCase().split(/\s+/);
  let salaryQuery: SalaryQuery | undefined;
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

  return {
    salaryQuery,
    textTerms: textTerms.length > 0 ? textTerms : undefined
  };
};

/**
 * Parse advanced salary patterns with units
 * Handles: $20/hr, $20-30/hr, $3000/month, $60000/year, etc.
 */
export const parseAdvancedSalaryPatterns = (searchQuery: string): {
  salaryQuery: SalaryQuery | null;
  remainingText: string
} => {
  const query = searchQuery.toLowerCase().trim();

  const salaryPatterns = [
    /\$(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?(\d+(?:\.\d{1,2})?))?\s*(?:\/?\s*(hr|hour|month|year|annual))?/g,
    /(\d+(?:\.\d{1,2})?)\s*(?:[-–]\s*(\d+(?:\.\d{1,2})?))?\s*\$?\s*(?:\/?\s*(hr|hour|month|year|annual))/g,
  ];

  let salaryQuery: SalaryQuery | null = null;
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
        const unit = unitMatch ? unitMatch[0] : "hr";

        let minHourly = min;
        let maxHourly = max;

        if (unit.includes("month")) {
          minHourly = min / 173;
          maxHourly = max ? max / 173 : undefined;
        } else if (unit.includes("year") || unit.includes("annual")) {
          minHourly = min / 2080;
          maxHourly = max ? max / 2080 : undefined;
        }

        salaryQuery = {
          min: minHourly,
          max: maxHourly,
          isRange: !!max,
        };

        remainingText = remainingText.replace(new RegExp(fullMatch, "gi"), "").trim();
        break;
      }
    }
  }

  return { salaryQuery, remainingText };
};

/**
 * Common roles for role detection
 */
export const COMMON_ROLES = [
  'barista', 'manager', 'cashier', 'server', 'cook', 'chef', 'waiter', 'waitress',
  'host', 'hostess', 'bartender', 'barback', 'line cook', 'dishwasher', 'assistant',
  'supervisor', 'lead', 'team', 'crew', 'staff', 'associate', 'representative',
  'agent', 'coordinator', 'specialist', 'technician', 'receptionist', 'secretary',
  'clerk', 'sales', 'service', 'customer', 'food', 'kitchen', 'front', 'back',
  'house', 'floor', 'delivery', 'driver', 'cleaner', 'maintenance', 'intern', 'trainee'
];

/**
 * Common business types for business type detection
 */
export const COMMON_BUSINESS_TYPES = [
  'restaurant', 'restaurants', 'cafe', 'cafes', 'coffee', 'shop', 'shops', 'bar',
  'bars', 'store', 'stores', 'hotel', 'hotels', 'gym', 'gyms', 'salon', 'salons',
  'bakery', 'bakeries', 'deli', 'delis', 'market', 'office', 'clinic', 'hospital',
  'bank', 'retail', 'fast', 'food', 'chain', 'franchise', 'boutique'
];
