import hospitalitySynonyms from '@/data/hospitalitySynonyms.json';
import nlp from 'compromise';

// In-memory cache for synonym lookups
const synonymCache = new Map<string, string[]>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

// Pre-computed top hospitality terms
let precomputedTerms: Set<string> | null = null;

/**
 * Get synonyms from hospitality industry supplement (fast, domain-specific)
 */
function getHospitalitySynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  
  // Direct match
  if (hospitalitySynonyms[normalized as keyof typeof hospitalitySynonyms]) {
    return hospitalitySynonyms[normalized as keyof typeof hospitalitySynonyms];
  }
  
  // Reverse lookup - if term is a synonym, return canonical + all synonyms
  for (const [canonical, synonyms] of Object.entries(hospitalitySynonyms)) {
    if (synonyms.includes(normalized)) {
      return [canonical, ...synonyms];
    }
  }
  
  return [];
}

/**
 * Get plural/singular variations using Compromise NLP
 */
function getWordVariations(term: string): string[] {
  try {
    const doc = nlp(term);
    const variations: string[] = [];
    
    const singular = doc.nouns().toSingular().text();
    const plural = doc.nouns().toPlural().text();
    
    if (singular && singular !== term) variations.push(singular);
    if (plural && plural !== term) variations.push(plural);
    
    return variations;
  } catch (e) {
    return [];
  }
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(term: string): boolean {
  const timestamp = cacheTimestamps.get(term);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_DURATION;
}

/**
 * Expand a term with synonyms using hybrid approach
 * 1. Check cache
 * 2. Check hospitality supplement (industry-specific)
 * 3. Query Moby thesaurus (general synonyms)
 * 4. Cache and return results
 */
export function expandWithSynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  
  // Check cache first
  if (isCacheValid(normalized) && synonymCache.has(normalized)) {
    return synonymCache.get(normalized)!;
  }
  
  const allSynonyms = new Set<string>([normalized]);
  
  // 1. Get hospitality-specific synonyms (highest priority)
  const hospitalityResults = getHospitalitySynonyms(normalized);
  hospitalityResults.forEach(syn => allSynonyms.add(syn.toLowerCase()));
  
  // 2. Get word variations (plural/singular) using Compromise
  const variations = getWordVariations(normalized);
  variations.forEach(variant => {
    allSynonyms.add(variant.toLowerCase());
    // Also expand variations through hospitality synonyms
    const variantSynonyms = getHospitalitySynonyms(variant);
    variantSynonyms.forEach(syn => allSynonyms.add(syn.toLowerCase()));
  });
  
  // Convert to array and cache
  const results = Array.from(allSynonyms);
  synonymCache.set(normalized, results);
  cacheTimestamps.set(normalized, Date.now());
  
  return results;
}

/**
 * Expand all terms in a search query
 */
export function expandQueryWithSynonyms(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  
  // Check if entire query matches a phrase in hospitality synonyms
  const phraseMatch = getHospitalitySynonyms(normalized);
  if (phraseMatch.length > 0) {
    // Expand each matched term as well
    const expandedSet = new Set<string>([normalized, ...phraseMatch]);
    phraseMatch.forEach(term => {
      expandWithSynonyms(term).forEach(syn => expandedSet.add(syn));
    });
    return Array.from(expandedSet);
  }
  
  // Otherwise split and expand individual terms
  const terms = normalized.split(/\s+/).filter(t => t.length > 1);
  const expandedSet = new Set<string>();
  
  terms.forEach(term => {
    expandWithSynonyms(term).forEach(syn => expandedSet.add(syn));
  });
  
  return Array.from(expandedSet);
}

/**
 * Check if two terms are synonyms
 */
export function areSynonyms(term1: string, term2: string): boolean {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();
  
  if (t1 === t2) return true;
  
  const expandedT1 = expandWithSynonyms(t1);
  return expandedT1.includes(t2);
}

/**
 * Pre-compute synonyms for common hospitality terms (optimization)
 * Call this on app initialization for better performance
 */
export function precomputeCommonTerms(): void {
  if (precomputedTerms) return; // Already precomputed
  
  precomputedTerms = new Set();
  const commonTerms = Object.keys(hospitalitySynonyms);
  
  // Precompute in background
  setTimeout(() => {
    commonTerms.forEach(term => {
      expandWithSynonyms(term);
      precomputedTerms?.add(term);
    });
    console.log(`Precomputed synonyms for ${commonTerms.length} hospitality terms`);
  }, 100);
}

/**
 * Clear synonym cache (useful for testing or memory management)
 */
export function clearSynonymCache(): void {
  synonymCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: synonymCache.size,
    precomputed: precomputedTerms?.size || 0,
  };
}
