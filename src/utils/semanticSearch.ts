import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Initialize wink-nlp with web model (lazy loaded)
let nlp: any = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Cache for semantic similarity calculations
const similarityCache = new Map<string, Map<string, number>>();
const termExpansionCache = new Map<string, string[]>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Initialize wink-nlp (lazy loaded on first use)
 */
async function initializeNLP(): Promise<void> {
  if (isInitialized) return;
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    try {
      nlp = winkNLP(model);
      isInitialized = true;
      console.log('wink-nlp semantic search initialized');
    } catch (error) {
      console.error('Failed to initialize wink-nlp:', error);
      throw error;
    }
  })();
  
  return initializationPromise;
}

/**
 * Get word vector for a term
 */
function getWordVector(term: string): number[] | null {
  if (!nlp) return null;
  
  try {
    const doc = nlp.readDoc(term.toLowerCase());
    const tokens = doc.tokens().out();
    
    if (tokens.length === 0) return null;
    
    // For multi-word terms, average the vectors
    const vectors: number[][] = [];
    doc.tokens().each((token: any) => {
      const vector = token.out(nlp.its.vector);
      if (vector && vector.length > 0) {
        vectors.push(vector);
      }
    });
    
    if (vectors.length === 0) return null;
    
    // Average vectors
    const dimensions = vectors[0].length;
    const avgVector = new Array(dimensions).fill(0);
    
    for (const vector of vectors) {
      for (let i = 0; i < dimensions; i++) {
        avgVector[i] += vector[i];
      }
    }
    
    for (let i = 0; i < dimensions; i++) {
      avgVector[i] /= vectors.length;
    }
    
    return avgVector;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  return dotProduct / (mag1 * mag2);
}

/**
 * Calculate semantic similarity between two terms (0.0 - 1.0)
 */
export async function calculateSimilarity(term1: string, term2: string): Promise<number> {
  await initializeNLP();
  
  const normalized1 = term1.toLowerCase().trim();
  const normalized2 = term2.toLowerCase().trim();
  
  // Check cache
  if (similarityCache.has(normalized1)) {
    const term1Cache = similarityCache.get(normalized1)!;
    if (term1Cache.has(normalized2)) {
      return term1Cache.get(normalized2)!;
    }
  }
  
  // Exact match
  if (normalized1 === normalized2) return 1.0;
  
  // Get vectors
  const vec1 = getWordVector(normalized1);
  const vec2 = getWordVector(normalized2);
  
  if (!vec1 || !vec2) return 0;
  
  const similarity = cosineSimilarity(vec1, vec2);
  
  // Cache result
  if (!similarityCache.has(normalized1)) {
    similarityCache.set(normalized1, new Map());
  }
  similarityCache.get(normalized1)!.set(normalized2, similarity);
  
  return similarity;
}

/**
 * Find semantically similar terms from a list of candidates
 */
export async function findSimilarTerms(
  term: string,
  candidates: string[],
  threshold: number = 0.6
): Promise<Array<{ term: string; similarity: number }>> {
  await initializeNLP();
  
  const results: Array<{ term: string; similarity: number }> = [];
  
  for (const candidate of candidates) {
    const similarity = await calculateSimilarity(term, candidate);
    if (similarity >= threshold) {
      results.push({ term: candidate, similarity });
    }
  }
  
  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results;
}

/**
 * Expand a term with semantically similar variations
 */
export async function expandWithSemantics(
  term: string,
  commonTerms: string[] = [],
  threshold: number = 0.65
): Promise<string[]> {
  await initializeNLP();
  
  const normalized = term.toLowerCase().trim();
  
  // Check cache
  const cacheKey = `${normalized}:${threshold}`;
  if (cacheTimestamps.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey)!;
    if (Date.now() - timestamp < CACHE_DURATION && termExpansionCache.has(cacheKey)) {
      return termExpansionCache.get(cacheKey)!;
    }
  }
  
  const expansions = new Set<string>([normalized]);
  
  // If we have common terms, find similar ones
  if (commonTerms.length > 0) {
    const similar = await findSimilarTerms(normalized, commonTerms, threshold);
    similar.forEach(({ term }) => expansions.add(term.toLowerCase()));
  }
  
  // Get plural/singular variations using wink-nlp
  try {
    const doc = nlp.readDoc(normalized);
    doc.tokens().each((token: any) => {
      const lemma = token.out(nlp.its.lemma);
      if (lemma && lemma !== normalized) {
        expansions.add(lemma.toLowerCase());
      }
    });
  } catch (error) {
    // Silent fail
  }
  
  const results = Array.from(expansions);
  
  // Cache results
  termExpansionCache.set(cacheKey, results);
  cacheTimestamps.set(cacheKey, Date.now());
  
  return results;
}

/**
 * Check if wink-nlp is initialized
 */
export function isSemanticSearchReady(): boolean {
  return isInitialized;
}

/**
 * Preload semantic search (call on app initialization)
 */
export async function preloadSemanticSearch(): Promise<void> {
  await initializeNLP();
}

/**
 * Clear semantic search caches
 */
export function clearSemanticCache(): void {
  similarityCache.clear();
  termExpansionCache.clear();
  cacheTimestamps.clear();
}
