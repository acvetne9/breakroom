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

// Approximate working hours used to convert salary between units
export const HOURS_PER_MONTH = 173;
export const HOURS_PER_YEAR = 2080;

/**
 * Parse salary to hourly rate from various formats
 * Handles: /hr, /hour, /mo, /month, /monthly, /yr, /year, /yearly, annual
 */
export const parseSalaryToHourly = (salary: string): number | null => {
  if (!salary) return null;

  const numericValue = parseFloat(salary.replace(/[$,]/g, ""));
  if (isNaN(numericValue)) return null;

  const salaryLower = salary.toLowerCase();

  if (salaryLower.includes("/hr") || salaryLower.includes("hour") || salaryLower.includes(" hr")) {
    return numericValue;
  } else if (
    salaryLower.includes("/mo") ||
    salaryLower.includes("month") ||
    salaryLower.includes(" mo")
  ) {
    return Math.round((numericValue / HOURS_PER_MONTH) * 100) / 100; // ~173 hours per month
  } else if (
    salaryLower.includes("/yr") ||
    salaryLower.includes("/year") ||
    salaryLower.includes("year") ||
    salaryLower.includes("annual") ||
    salaryLower.includes(" yr")
  ) {
    return Math.round((numericValue / HOURS_PER_YEAR) * 100) / 100; // ~2080 hours per year
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
 * Handles: $20/hr, 20/hr, $3000/mo, 60000/yr, 15/hour, $20-30/hr, etc.
 * Shows jobs at that pay "or better" (minimum threshold)
 */
export const parseAdvancedSalaryPatterns = (searchQuery: string): {
  salaryQuery: SalaryQuery | null;
  remainingText: string
} => {
  const query = searchQuery.toLowerCase().trim();

  // Enhanced patterns to handle more variations including "mo" and "yr"
  const salaryPatterns = [
    // With dollar sign: $20/hr, $20/hour, $3000/mo, $60000/yr
    /\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?))?\s*(?:\/\s*)?(hr|hour|mo|month|yr|year|annual|annually)?/gi,
    // Without dollar sign: 20/hr, 3000/mo, 60000/yr, 15 hr, 20-30/hr
    /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:[-–]\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?))?\s*\$?\s*(?:\/\s*)?(hr|hour|mo|month|yr|year|annual|annually)/gi,
  ];

  let salaryQuery: SalaryQuery | null = null;
  let remainingText = searchQuery;

  for (const pattern of salaryPatterns) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(query);
    if (match) {
      const fullMatch = match[0];
      const parts = fullMatch.match(/(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g);
      if (parts) {
        const min = parseFloat(parts[0].replace(/,/g, ''));
        const max = parts[1] ? parseFloat(parts[1].replace(/,/g, '')) : undefined;

        // Extract unit, defaulting to "hr" if not specified
        const unitMatch = fullMatch.match(/(hr|hour|mo|month|yr|year|annual)/i);
        const unit = unitMatch ? unitMatch[0].toLowerCase() : "hr";

        let minHourly = min;
        let maxHourly = max;

        // Convert to hourly rate based on unit
        if (unit.includes("mo") || unit.includes("month")) {
          minHourly = min / HOURS_PER_MONTH; // ~173 hours per month
          maxHourly = max ? max / HOURS_PER_MONTH : undefined;
        } else if (unit.includes("yr") || unit.includes("year") || unit.includes("annual")) {
          minHourly = min / HOURS_PER_YEAR; // ~2080 hours per year
          maxHourly = max ? max / HOURS_PER_YEAR : undefined;
        }

        salaryQuery = {
          min: Math.round(minHourly * 100) / 100, // Round to 2 decimal places
          max: maxHourly ? Math.round(maxHourly * 100) / 100 : undefined,
          isRange: !!max,
        };

        // Remove the salary pattern from search query
        remainingText = remainingText.replace(new RegExp(fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi"), "").trim();
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
  'bank', 'retail', 'fast', 'food', 'chain', 'franchise', 'boutique',
  'pizzeria', 'pizzerias', 'boutiques', 'markets', 'studio', 'studios', 'spa',
  'spas', 'hostel', 'hostels', 'club', 'clubs', 'lounge', 'lounges', 'pub',
  'pubs', 'brewery', 'breweries', 'bodega', 'bodegas', 'grocery', 'groceries',
  'bookstore', 'bookstores', 'gallery', 'galleries', 'theater', 'theaters',
  'cinema', 'cinemas'
];
