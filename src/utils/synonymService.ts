import hospitalitySynonyms from "@/data/hospitalitySynonyms.json";
import nlp from "compromise";
import {
  expandWithSemantics,
  calculateSimilarity,
  preloadSemanticSearch,
  clearSemanticCache as clearSemanticSearchCache,
} from "./semanticSearch";

// In-memory cache for synonym lookups
const synonymCache = new Map<string, string[]>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

// Pre-computed top hospitality terms
let precomputedTerms: Set<string> | null = null;
const COMMON_HOSPITALITY_ROLES = [
  "server",
  "bartender",
  "barista",
  "cook",
  "chef",
  "manager",
  "host",
  "hostess",
  "dishwasher",
  "busser",
  "cashier",
  "shift lead",
  "supervisor",
  "assistant manager",
  "general manager",
  "kitchen manager",
  "line cook",
  "prep cook",
  "sous chef",
  "food runner",
  "expediter",
  "barback",
  "sommelier",
  "mixologist",
  "waiter",
  "waitress",
  "table server",
  "dining server",
  "restaurant server",
  "catering server",
  "banquet server",
  "event server",
  "cafe worker",
  "coffee maker",
  "kitchen staff",
  "front desk",
  "receptionist",
  "concierge",
  "room service",
  "housekeeper",
  "maintenance",
  "porter",
  "valet",
  "attendant",
  "coordinator",
];

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
 * 2. Check hospitality slang supplement (industry abbreviations)
 * 3. Use semantic similarity with wink-nlp (intelligent matching)
 * 4. Get word variations (plural/singular)
 * 5. Cache and return results
 */
export async function expandWithSynonyms(term: string): Promise<string[]> {
  const normalized = term.toLowerCase().trim();

  // Check cache first
  if (isCacheValid(normalized) && synonymCache.has(normalized)) {
    return synonymCache.get(normalized)!;
  }

  const allSynonyms = new Set<string>([normalized]);

  // 1. Get hospitality slang/abbreviations (instant lookup)
  const hospitalityResults = getHospitalitySynonyms(normalized);
  hospitalityResults.forEach((syn) => allSynonyms.add(syn.toLowerCase()));

  // 2. Use semantic search to find similar terms (intelligent matching)
  try {
    const semanticExpansions = await expandWithSemantics(
      normalized,
      COMMON_HOSPITALITY_ROLES,
      0.65, // Similarity threshold (0.0 - 1.0)
    );
    semanticExpansions.forEach((syn) => allSynonyms.add(syn.toLowerCase()));
  } catch (error) {
    console.warn("Semantic expansion failed, falling back to basic expansion:", error);
  }

  // 3. Get word variations (plural/singular) using Compromise
  const variations = getWordVariations(normalized);
  variations.forEach((variant) => {
    allSynonyms.add(variant.toLowerCase());
    // Also expand variations through hospitality synonyms
    const variantSynonyms = getHospitalitySynonyms(variant);
    variantSynonyms.forEach((syn) => allSynonyms.add(syn.toLowerCase()));
  });

  // Convert to array and cache
  const results = Array.from(allSynonyms);
  synonymCache.set(normalized, results);
  cacheTimestamps.set(normalized, Date.now());

  return results;
}

/**
 * Synchronous version for backward compatibility
 * Returns basic expansions immediately, semantic expansions happen in background
 */
export function expandWithSynonymsSync(term: string): string[] {
  const normalized = term.toLowerCase().trim();

  // Check cache first
  if (isCacheValid(normalized) && synonymCache.has(normalized)) {
    return synonymCache.get(normalized)!;
  }

  const allSynonyms = new Set<string>([normalized]);

  // Get hospitality slang/abbreviations
  const hospitalityResults = getHospitalitySynonyms(normalized);
  hospitalityResults.forEach((syn) => allSynonyms.add(syn.toLowerCase()));

  // Get word variations
  const variations = getWordVariations(normalized);
  variations.forEach((variant) => {
    allSynonyms.add(variant.toLowerCase());
    const variantSynonyms = getHospitalitySynonyms(variant);
    variantSynonyms.forEach((syn) => allSynonyms.add(syn.toLowerCase()));
  });

  // Trigger async semantic expansion in background
  expandWithSynonyms(term).catch(() => {});

  return Array.from(allSynonyms);
}

/**
 * Expand all terms in a search query (async version)
 */
export async function expandQueryWithSynonyms(query: string): Promise<string[]> {
  const normalized = query.toLowerCase().trim();

  // Check if entire query matches a phrase in hospitality synonyms
  const phraseMatch = getHospitalitySynonyms(normalized);
  if (phraseMatch.length > 0) {
    // Expand each matched term as well
    const expandedSet = new Set<string>([normalized, ...phraseMatch]);
    for (const term of phraseMatch) {
      const expansions = await expandWithSynonyms(term);
      expansions.forEach((syn) => expandedSet.add(syn));
    }
    return Array.from(expandedSet);
  }

  // Otherwise split and expand individual terms
  const terms = normalized.split(/\s+/).filter((t) => t.length > 1);
  const expandedSet = new Set<string>();

  for (const term of terms) {
    const expansions = await expandWithSynonyms(term);
    expansions.forEach((syn) => expandedSet.add(syn));
  }

  return Array.from(expandedSet);
}

/**
 * Synchronous version of expandQueryWithSynonyms
 */
export function expandQueryWithSynonymsSync(query: string): string[] {
  const normalized = query.toLowerCase().trim();

  const phraseMatch = getHospitalitySynonyms(normalized);
  if (phraseMatch.length > 0) {
    const expandedSet = new Set<string>([normalized, ...phraseMatch]);
    phraseMatch.forEach((term) => {
      expandWithSynonymsSync(term).forEach((syn) => expandedSet.add(syn));
    });
    return Array.from(expandedSet);
  }

  const terms = normalized.split(/\s+/).filter((t) => t.length > 1);
  const expandedSet = new Set<string>();

  terms.forEach((term) => {
    expandWithSynonymsSync(term).forEach((syn) => expandedSet.add(syn));
  });

  return Array.from(expandedSet);
}

/**
 * Check if two terms are synonyms (async version)
 */
export async function areSynonyms(term1: string, term2: string): Promise<boolean> {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();

  if (t1 === t2) return true;

  // Try semantic similarity first
  try {
    const similarity = await calculateSimilarity(t1, t2);
    if (similarity >= 0.7) return true;
  } catch (error) {
    // Fall back to expansion check
  }

  const expandedT1 = await expandWithSynonyms(t1);
  return expandedT1.includes(t2);
}

/**
 * Synchronous version of areSynonyms
 */
export function areSynonymsSync(term1: string, term2: string): boolean {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();

  if (t1 === t2) return true;

  const expandedT1 = expandWithSynonymsSync(t1);
  return expandedT1.includes(t2);
}

/**
 * Pre-compute synonyms for common hospitality terms (optimization)
 * Call this on app initialization for better performance
 */
export async function precomputeCommonTerms(): Promise<void> {
  if (precomputedTerms) return; // Already precomputed

  // Preload semantic search model
  await preloadSemanticSearch();

  precomputedTerms = new Set();
  const commonTerms = [...Object.keys(hospitalitySynonyms), ...COMMON_HOSPITALITY_ROLES];

  // Precompute in background
  setTimeout(async () => {
    for (const term of commonTerms) {
      await expandWithSynonyms(term);
      precomputedTerms?.add(term);
    }
    console.log(`Precomputed synonyms for ${commonTerms.length} hospitality terms using semantic search`);
  }, 100);
}

/**
 * Clear synonym cache (useful for testing or memory management)
 */
export function clearSynonymCache(): void {
  synonymCache.clear();
  cacheTimestamps.clear();
  clearSemanticSearchCache();
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
