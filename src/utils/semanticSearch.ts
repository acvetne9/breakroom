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

// Local fallback synonyms
const LOCAL_SYNONYMS: Record<string, string[]> = {
  job: ["work", "employment", "position", "occupation", "career"],
  haircut: ["trim", "barber", "style", "cut"],
  waitress: ["server", "waiter", "attendant", "hostess"],
  happy: ["joyful", "content", "cheerful", "glad"],
  fast: ["quick", "rapid", "speedy", "swift"],
};

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
 * Get synonyms dynamically via Datamuse API, with local fallback.
 */
async function getSynonyms(term: string): Promise<string[]> {
  const local = LOCAL_SYNONYMS[term.toLowerCase()];
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(term)}`);
    if (!res.ok) return local || [];
    const data = await res.json();
    const words = data.map((entry: { word: string }) => entry.word);
    return Array.from(new Set([...(local || []), ...words]));
  } catch {
    return local || [];
  }
}

/**
 * Lexical (character-level) similarity
 */
function lexicalSimilarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1.0;

  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Calculate pseudo-semantic similarity between two terms
 */
export async function calculateSimilarity(term1: string, term2: string): Promise<number> {
  await initializeNLP();

  const normalized1 = term1.toLowerCase().trim();
  const normalized2 = term2.toLowerCase().trim();

  if (similarityCache.has(normalized1)) {
    const term1Cache = similarityCache.get(normalized1)!;
    if (term1Cache.has(normalized2)) {
      return term1Cache.get(normalized2)!;
    }
  }

  if (normalized1 === normalized2) {
    return 1.0;
  }

  let similarity = lexicalSimilarity(normalized1, normalized2);

  // ✅ Await async synonym lookup
  const syn1 = new Set(await getSynonyms(normalized1));
  const syn2 = new Set(await getSynonyms(normalized2));

  const overlap = [...syn1].filter((x) => syn2.has(x));
  if (overlap.length > 0) {
    similarity = Math.max(similarity, 0.9);
  }

  if (!similarityCache.has(normalized1)) {
    similarityCache.set(normalized1, new Map());
  }
  similarityCache.get(normalized1)!.set(normalized2, similarity);

  return similarity;
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

  // ✅ Await async synonyms
  const syns = await getSynonyms(normalized);
  syns.forEach((s) => expansions.add(s.toLowerCase()));

  if (commonTerms.length > 0) {
    const similar = await findSimilarTerms(normalized, commonTerms, threshold);
    similar.forEach(({ term }) => expansions.add(term.toLowerCase()));
  }

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

export async function preloadSemanticSearch() {
  // initialization logic
}

export function clearSemanticCache() {
  // cache clearing logic
}

export async function findSimilarTerms(term: string): Promise<string[]> {
  return [term, `${term}s`, `${term}ing`, `${term}ed`];
}
