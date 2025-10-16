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

// Hospitality-specific synonym dictionary
const HOSPITALITY_SYNONYMS: Record<string, string[]> = {
  // Server roles
  waitress: ["server", "wait staff", "waiter", "waitperson", "table server"],
  waiter: ["server", "wait staff", "waitress", "waitperson", "table server"],
  server: ["waiter", "waitress", "wait staff", "waitperson", "table server"],
  "wait staff": ["server", "waiter", "waitress", "waitperson", "table server"],
  
  // Bar roles
  bartender: ["barman", "barmaid", "mixologist", "bar staff", "bar tender"],
  barista: ["coffee maker", "espresso bar", "cafe worker", "coffee specialist"],
  mixologist: ["bartender", "bar staff", "cocktail maker"],
  
  // Kitchen roles
  cook: ["chef", "kitchen staff", "line cook", "prep cook", "culinary staff"],
  chef: ["cook", "head chef", "kitchen staff", "culinary professional", "sous chef"],
  "line cook": ["cook", "chef", "kitchen staff", "prep cook"],
  "prep cook": ["cook", "chef", "kitchen staff", "line cook"],
  dishwasher: ["dish", "kitchen staff", "steward"],
  
  // Management
  manager: ["general manager", "gm", "supervisor", "management"],
  "general manager": ["manager", "gm", "supervisor", "management"],
  gm: ["general manager", "manager", "supervisor"],
  supervisor: ["manager", "lead", "management", "shift lead"],
  
  // Front of house
  host: ["hostess", "greeter", "front desk", "maitre d"],
  hostess: ["host", "greeter", "front desk", "maitre d"],
  busser: ["busboy", "bus person", "table cleaner"],
  
  // Specialty
  sommelier: ["wine steward", "wine expert", "wine specialist"],
  runner: ["food runner", "expo", "expeditor"],
  cashier: ["register", "front counter", "point of sale"],
};

// Cache management
interface CacheEntry {
  terms: string[];
  timestamp: number;
}

const expansionCache = new Map<string, CacheEntry>();
const CACHE_KEY = "smartSearchCache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Load cache from localStorage
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

// Save cache to localStorage
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

// Check if cache entry is valid
function isCacheValid(term: string): boolean {
  const entry = expansionCache.get(term);
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

// Initialize cache on module load
loadCache();

/**
 * Fetch synonyms from Datamuse API with timeout
 */
async function fetchDatamuseSynonyms(term: string, timeoutMs: number = 2000): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const res = await fetch(
      `https://api.datamuse.com/words?ml=${encodeURIComponent(term)}&max=10`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    if (!res.ok) return [];
    
    const data = await res.json();
    return data.slice(0, 10).map((entry: { word: string }) => entry.word);
  } catch (error) {
    // Timeout or network error
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
  } catch (e) {
    // Silent fail for NLP errors
  }
  
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
      if (lemma && lemma !== term) {
        lemmas.add(lemma.toLowerCase());
      }
    });
    
    return Array.from(lemmas);
  } catch (e) {
    return [];
  }
}

/**
 * Main function: Expand a term with smart semantic search
 * Uses cache -> hospitality synonyms -> Datamuse API -> NLP variations
 */
export async function expandTerm(term: string): Promise<string[]> {
  const normalized = term.toLowerCase().trim();
  
  // 1. Check cache first (instant)
  if (isCacheValid(normalized)) {
    const cached = expansionCache.get(normalized);
    if (cached) return cached.terms;
  }
  
  const expansions = new Set<string>([normalized]);
  
  // 2. Get hospitality-specific synonyms (instant)
  const hospitalityMatches = HOSPITALITY_SYNONYMS[normalized] || [];
  hospitalityMatches.forEach(match => expansions.add(match.toLowerCase()));
  
  // Also check if this term appears in any synonym list
  Object.entries(HOSPITALITY_SYNONYMS).forEach(([key, values]) => {
    if (values.includes(normalized)) {
      expansions.add(key.toLowerCase());
      values.forEach(v => expansions.add(v.toLowerCase()));
    }
  });
  
  // 3. Call Datamuse API (with 2s timeout)
  try {
    const apiResults = await fetchDatamuseSynonyms(normalized, 2000);
    apiResults.forEach(result => expansions.add(result.toLowerCase()));
  } catch (e) {
    // Continue without API results
  }
  
  // 4. Get word variations from compromise (instant)
  const variations = getWordVariations(normalized);
  variations.forEach(variant => expansions.add(variant.toLowerCase()));
  
  // 5. Get lemmas from wink-nlp (instant)
  const lemmas = getLemmas(normalized);
  lemmas.forEach(lemma => expansions.add(lemma.toLowerCase()));
  
  // 6. Cache results and save
  const results = Array.from(expansions);
  expansionCache.set(normalized, {
    terms: results,
    timestamp: Date.now()
  });
  saveCache();
  
  return results;
}

/**
 * Expand multiple terms in a query
 */
export async function expandQuery(query: string): Promise<string[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allExpansions = new Set<string>();
  
  await Promise.all(
    terms.map(async (term) => {
      const expanded = await expandTerm(term);
      expanded.forEach(exp => allExpansions.add(exp));
    })
  );
  
  return Array.from(allExpansions);
}

/**
 * Check if two terms are synonyms
 */
export async function areSynonyms(term1: string, term2: string): Promise<boolean> {
  const normalized1 = term1.toLowerCase().trim();
  const normalized2 = term2.toLowerCase().trim();
  
  if (normalized1 === normalized2) return true;
  
  const expansions1 = await expandTerm(normalized1);
  const expansions2 = await expandTerm(normalized2);
  
  return expansions1.some(exp => expansions2.includes(exp));
}

/**
 * Pre-compute common hospitality terms on app load
 */
export async function precomputeCommonTerms(): Promise<void> {
  const commonTerms = [
    "waitress", "waiter", "server", "wait staff",
    "bartender", "barista", "mixologist",
    "cook", "chef", "line cook", "prep cook",
    "host", "hostess", "busser",
    "manager", "supervisor", "gm",
    "dishwasher", "runner", "cashier", "sommelier"
  ];
  
  // Pre-compute in batches to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < commonTerms.length; i += batchSize) {
    const batch = commonTerms.slice(i, i + batchSize);
    await Promise.all(batch.map(term => expandTerm(term)));
    // Small delay between batches
    if (i + batchSize < commonTerms.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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
    terms: Array.from(expansionCache.keys())
  };
}
