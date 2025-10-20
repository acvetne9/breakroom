import Fuse from 'fuse.js';

/**
 * Calculate fuzzy match score between a business and query (0-1, higher = better match)
 * Synchronous function for performance
 */
export function calculateBusinessFuzzyScore(
  businessName: string, 
  businessType: string, 
  roles: string[], 
  query: string
): number {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(t => t.length > 1);
  
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
  terms.forEach(term => {
    const results = fuse.search(term);
    if (results.length > 0) {
      const score = 1 - (results[0].score || 0);
      if (score > bestScore) bestScore = score;
    }
  });
  
  return bestScore;
}
