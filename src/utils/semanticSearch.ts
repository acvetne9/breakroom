declare module "synonyms" {
  function synonyms(word: string): Record<string, string[]> | null;
  export = synonyms;
}

import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

// Initialize wink-nlp with web model (lazy loaded)
let nlp: any = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Cache for semantic similarity calculations
const similarityCache = new Map<string, Map<string, number>>();
const termExpansionCache = new Map<string, string[]>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

async function initializeNLP(): Promise<void> {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      nlp = winkNLP(model);
      isInitialized = true;
      console.log("wink-nlp semantic search initialized");
    } catch (error) {
      console.error("Failed to initialize wink-nlp:", error);
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Instead of word vectors, use lexical + synonym expansion similarity
 */
function lexicalSimilarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1.0;

  // Simple character-level similarity (Jaccard)
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Get synonyms for a term using `synonyms` package
 */
function getSynonyms(term: string): string[] {
  try {
    const syns: Record<string, string[]> | null = synonyms(term.toLowerCase());
    if (!syns) return [];
    // Flatten categories (noun, verb, adj, adv)
    return Object.values(syns).flatMap((v) => v as string[]);
  } catch {
    return [];
  }
}

/**
 * Calculate pseudo-semantic similarity between two terms
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

  if (normalized1 === normalized2) {
    return 1.0;
  }

  // Compute lexical similarity
  let similarity = lexicalSimilarity(normalized1, normalized2);

  // Check synonym overlap
  const syn1 = new Set(getSynonyms(normalized1));
  const syn2 = new Set(getSynonyms(normalized2));
  const overlap = [...syn1].filter((x) => syn2.has(x));
  if (overlap.length > 0) {
    similarity = Math.max(similarity, 0.9);
  }

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
  threshold: number = 0.6,
): Promise<Array<{ term: string; similarity: number }>> {
  await initializeNLP();

  const results: Array<{ term: string; similarity: number }> = [];

  for (const candidate of candidates) {
    const similarity = await calculateSimilarity(term, candidate);
    if (similarity >= threshold) {
      results.push({ term: candidate, similarity });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Expand a term with semantically similar variations
 */
export async function expandWithSemantics(
  term: string,
  commonTerms: string[] = [],
  threshold: number = 0.65,
): Promise<string[]> {
  await initializeNLP();

  const normalized = term.toLowerCase().trim();
  const cacheKey = `${normalized}:${threshold}`;

  if (cacheTimestamps.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey)!;
    if (Date.now() - timestamp < CACHE_DURATION && termExpansionCache.has(cacheKey)) {
      return termExpansionCache.get(cacheKey)!;
    }
  }

  const expansions = new Set<string>([normalized]);

  // Add WordNet synonyms
  const syns = getSynonyms(normalized);
  syns.forEach((s) => expansions.add(s.toLowerCase()));

  // Check common terms for semantic similarity
  if (commonTerms.length > 0) {
    const similar = await findSimilarTerms(normalized, commonTerms, threshold);
    similar.forEach(({ term }) => expansions.add(term.toLowerCase()));
  }

  // Lemmas from wink-nlp
  try {
    const doc = nlp.readDoc(normalized);
    doc.tokens().each((token: any) => {
      const lemma = token.out(nlp.its.lemma);
      if (lemma && lemma !== normalized) {
        expansions.add(lemma.toLowerCase());
      }
    });
  } catch {}

  const results = Array.from(expansions);
  termExpansionCache.set(cacheKey, results);
  cacheTimestamps.set(cacheKey, Date.now());
  return results;
}

export function isSemanticSearchReady(): boolean {
  return isInitialized;
}

export async function preloadSemanticSearch(): Promise<void> {
  await initializeNLP();
}

export function clearSemanticCache(): void {
  similarityCache.clear();
  termExpansionCache.clear();
  cacheTimestamps.clear();
}
