import nlp from "compromise";
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

// Initialize wink-nlp
let winkInstance: any = null;
let winkInitialized = false;

function ensureWinkNLP() {
  if (!winkInitialized) {
    try {
      winkInstance = winkNLP(model);
      winkInitialized = true;
    } catch (e) {
      console.warn("Failed to initialize wink-nlp:", e);
    }
  }
  return winkInstance;
}

/**
 * Cache management
 */
interface CacheEntry {
  terms: string[];
  timestamp: number;
}

const expansionCache = new Map<string, CacheEntry>();
const CACHE_KEY = "smartSearchCache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function loadCache() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      Object.entries(data).forEach(([key, value]: [string, any]) => {
        expansionCache.set(key, value as CacheEntry);
      });
    }
  } catch (e) {
    console.warn("Failed to load search cache:", e);
  }
}

function saveCache() {
  try {
    const data: Record<string, CacheEntry> = {};
    expansionCache.forEach((value, key) => {
      data[key] = value;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save search cache:", e);
  }
}

function isCacheValid(term: string): boolean {
  const entry = expansionCache.get(term);
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

// Initialize cache at module load
loadCache();

/**
 * Fetch synonyms dynamically from Datamuse API with timeout
 * Datamuse returns semantically related words for any domain.
 */
async function fetchDatamuseSynonyms(term: string, timeoutMs: number = 2000): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(term)}&max=20`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];

    const data = await res.json();
    return data.map((entry: { word: string }) => entry.word.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Get word variations using compromise NLP
 */
function getWordVariations(term: string): string[] {
  const variations = new Set<string>();
  try {
    const doc = nlp(term);
    const singular = doc.nouns().toSingular().text();
    const plural = doc.nouns().toPlural().text();
    if (singular && singular !== term) variations.add(singular);
    if (plural && plural !== term) variations.add(plural);
  } catch {}
  return Array.from(variations);
}

/**
 * Get lemmatized forms using wink-nlp
 */
function getLemmas(term: string): string[] {
  const wink = ensureWinkNLP();
  if (!wink) return [];
  try {
    const doc = wink.readDoc(term);
    const lemmas = new Set<string>();
    doc.tokens().each((token: any) => {
      const lemma = token.out(wink.its.lemma);
      if (lemma && lemma !== term) lemmas.add(lemma.toLowerCase());
    });
    return Array.from(lemmas);
  } catch {
    return [];
  }
}

/**
 * Main function: Expand a term with smart semantic search
 * Works for any job title, concept, or keyword.
 */
export async function expandTerm(term: string): Promise<string[]> {
  const normalized = term.toLowerCase().trim();

  // 1️⃣ Cache check
  if (isCacheValid(normalized)) {
    const cached = expansionCache.get(normalized);
    if (cached) return cached.terms;
  }

  const expansions = new Set<string>([normalized]);

  // 2️⃣ Datamuse semantic synonyms (dynamic, domain-agnostic)
  try {
    const apiResults = await fetchDatamuseSynonyms(normalized);
    apiResults.forEach((r) => expansions.add(r));
  } catch {}

  // 3️⃣ NLP-based variations
  getWordVariations(normalized).forEach((v) => expansions.add(v));
  getLemmas(normalized).forEach((v) => expansions.add(v));

  // 4️⃣ Cache results
  const results = Array.from(expansions);
  expansionCache.set(normalized, {
    terms: results,
    timestamp: Date.now(),
  });
  saveCache();

  return results;
}

/**
 * Expand all terms in a multi-word query
 */
export async function expandQuery(query: string): Promise<string[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allExpansions = new Set<string>();

  await Promise.all(
    terms.map(async (term) => {
      const expanded = await expandTerm(term);
      expanded.forEach((exp) => allExpansions.add(exp));
    }),
  );

  return Array.from(allExpansions);
}

/**
 * Check if two terms are synonyms or conceptually related
 */
export async function areSynonyms(term1: string, term2: string): Promise<boolean> {
  const normalized1 = term1.toLowerCase().trim();
  const normalized2 = term2.toLowerCase().trim();

  if (normalized1 === normalized2) return true;

  const expansions1 = await expandTerm(normalized1);
  const expansions2 = await expandTerm(normalized2);

  return expansions1.some((exp) => expansions2.includes(exp));
}

/**
 * Preload commonly searched job terms (optional)
 */
export async function precomputeCommonTerms(): Promise<void> {
  const commonTerms = [
    "waitress",
    "developer",
    "teacher",
    "nurse",
    "driver",
    "chef",
    "bartender",
    "manager",
    "designer",
    "engineer",
    "cashier",
    "cleaner",
  ];

  const batchSize = 5;
  for (let i = 0; i < commonTerms.length; i += batchSize) {
    const batch = commonTerms.slice(i, i + batchSize);
    await Promise.all(batch.map((term) => expandTerm(term)));
    if (i + batchSize < commonTerms.length) await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Clear the expansion cache
 */
export function clearCache(): void {
  expansionCache.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.warn("Failed to clear cache:", e);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: expansionCache.size,
    terms: Array.from(expansionCache.keys()),
  };
}
