import Fuse from 'fuse.js';
import { Business } from '@/types/business';
import { expandWithSynonyms } from './searchSynonyms';

export interface FuzzySearchOptions {
  threshold?: number; // 0.0 = exact, 1.0 = match anything (default: 0.4)
  limit?: number;
  includeScore?: boolean;
}

/**
 * Create a Fuse.js instance for business searching
 */
export function createBusinessFuseIndex(businesses: Business[]): Fuse<Business> {
  return new Fuse(businesses, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'businessType', weight: 0.2 },
      { name: 'roles.role', weight: 0.3 }
    ],
    threshold: 0.4, // Allow ~60% character similarity
    includeScore: true,
    ignoreLocation: true, // Match anywhere in string
    minMatchCharLength: 2,
    distance: 100,
    useExtendedSearch: false
  });
}

/**
 * Fuzzy search businesses with synonym expansion
 */
export function fuzzySearchBusinesses(
  businesses: Business[],
  query: string,
  options: FuzzySearchOptions = {}
): Array<{ business: Business; score: number }> {
  const {
    threshold = 0.4,
    limit = 50,
    includeScore = true
  } = options;
  
  if (!query.trim() || businesses.length === 0) {
    return [];
  }
  
  // Parse query into terms and expand with synonyms
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const expandedTerms = terms.flatMap(expandWithSynonyms);
  
  console.log(`🔍 Fuzzy search: "${query}" expanded to:`, expandedTerms.slice(0, 10));
  
  const fuse = createBusinessFuseIndex(businesses);
  const resultMap = new Map<string, { business: Business; score: number }>();
  
  // Search for each expanded term
  expandedTerms.forEach(term => {
    const results = fuse.search(term, { limit: limit * 2 });
    
    results.forEach(result => {
      const businessId = result.item.id;
      const score = 1 - (result.score || 0); // Invert: higher = better
      
      // Keep the best score for each business
      const existing = resultMap.get(businessId);
      if (!existing || score > existing.score) {
        resultMap.set(businessId, {
          business: result.item,
          score
        });
      }
    });
  });
  
  // Sort by score and limit results
  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Calculate fuzzy match score between a business and query (0-1, higher = better match)
 */
export function calculateBusinessFuzzyScore(businessName: string, businessType: string, roles: string[], query: string): number {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(t => t.length > 1);
  const expandedTerms = terms.flatMap(expandWithSynonyms);
  
  // Create searchable content from business
  const searchableContent = [
    businessName,
    businessType,
    ...roles
  ].filter(Boolean).join(' ');
  
  const fuse = new Fuse([searchableContent], {
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true
  });
  
  let bestScore = 0;
  expandedTerms.forEach(term => {
    const results = fuse.search(term);
    if (results.length > 0) {
      const score = 1 - (results[0].score || 0);
      if (score > bestScore) bestScore = score;
    }
  });
  
  return bestScore;
}

/**
 * Calculate fuzzy match score between two strings (0-1, higher = better match)
 */
export function calculateFuzzyScore(str1: string, str2: string): number {
  const fuse = new Fuse([str1], {
    threshold: 0.6,
    includeScore: true
  });
  
  const results = fuse.search(str2);
  if (results.length === 0) return 0;
  
  return 1 - (results[0].score || 0);
}
