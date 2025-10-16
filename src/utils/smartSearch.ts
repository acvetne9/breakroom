import nlp from "compromise";
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";
import Fuse from "fuse.js";
import { pipeline } from "@xenova/transformers";

// -------------------- Initialization --------------------

let winkInstance: any = null;
let winkInitialized = false;
let embedder: any = null;
let embedderReady = false;

async function ensureEmbedder() {
  if (!embedderReady) {
    try {
      embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      embedderReady = true;
    } catch (e) {
      console.warn("Failed to initialize transformer embedder:", e);
    }
  }
  return embedder;
}

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

// -------------------- Cache Management --------------------

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

loadCache();

// -------------------- Helpers --------------------

// Fuzzy search to catch misspellings and small variations
function fuzzyMatch(term: string, candidates: string[]): string[] {
  const fuse = new Fuse(candidates, { includeScore: true, threshold: 0.4 });
  return fuse.search(term).map((r) => r.item);
}

// Compute semantic similarity using embeddings
async function getSemanticNeighbors(term: string, candidates: string[]): Promise<string[]> {
  const model = await ensureEmbedder();
  if (!model) return [];

  const queryVec = (await model(term)).data[0];
  const candidateVecs = await Promise.all(candidates.map(async (c) => (await model(c)).data[0]));

  function cosine(a: number[], b: number[]) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v ** 2, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v ** 2, 0));
    return dot / (normA * normB);
  }

  const scores = candidates.map((c, i) => ({ term: c, score: cosine(queryVec, candidateVecs[i]) }));
  scores.sort((a, b) => b.score - a.score);

  // return the most semantically similar ones
  return scores.filter((s) => s.score > 0.6).map((s) => s.term);
}

// Get plural/singular variants
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

// Get lemmatized forms (verb/noun base forms)
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

// -------------------- Main Expansion --------------------

/**
 * Expand a search term:
 * - Handles fuzzy matching (misspellings)
 * - Expands to lemmas/plurals
 * - Finds semantically similar words (locally)
 */
export async function expandTerm(term: string): Promise<string[]> {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return [];

  // Check cache first
  if (isCacheValid(normalized)) {
    const cached = expansionCache.get(normalized);
    if (cached) {
      console.log(`📦 Cache hit for term: ${normalized}`);
      return cached.terms;
    }
  }

  // Always start with the original term
  const expansions = new Set<string>([normalized]);

  try {
    // Add morphological variations (plural/singular)
    const variations = getWordVariations(normalized);
    variations.forEach((v) => expansions.add(v));

    // Add lemmatized forms
    const lemmas = getLemmas(normalized);
    lemmas.forEach((v) => expansions.add(v));

    // Try semantic expansion with timeout
    try {
      const semanticPromise = getSemanticNeighbors(
        normalized,
        Array.from(expansions).concat([
          "server",
          "waiter",
          "waitress",
          "restaurant",
          "kitchen",
          "barista",
          "bartender",
          "chef",
          "cook",
          "cashier",
          "host",
          "hostess",
        ]),
      );

      // Add 2 second timeout for semantic search
      const timeoutPromise = new Promise<string[]>((resolve) => 
        setTimeout(() => resolve([]), 2000)
      );

      const semanticNeighbors = await Promise.race([semanticPromise, timeoutPromise]);
      semanticNeighbors.forEach((v) => expansions.add(v));
    } catch (e) {
      console.warn("Semantic expansion failed:", e);
    }

    // Add fuzzy matches
    const currentExpansions = Array.from(expansions);
    const fuzzy = fuzzyMatch(normalized, currentExpansions);
    fuzzy.forEach((v) => expansions.add(v));

  } catch (error) {
    console.warn(`Failed to expand term "${normalized}":`, error);
  }

  const results = Array.from(expansions);
  
  // Cache results
  expansionCache.set(normalized, { terms: results, timestamp: Date.now() });
  saveCache();

  console.log(`🔍 Expanded "${normalized}" to: ${results.join(', ')}`);
  return results;
}

// -------------------- Optional Precomputation --------------------

export async function precomputeCommonTerms(): Promise<void> {
  const commonTerms = [
    "waitress",
    "waiter",
    "server",
    "bartender",
    "barista",
    "cook",
    "chef",
    "host",
    "hostess",
    "busser",
    "dishwasher",
    "manager",
    "supervisor",
    "cashier",
  ];
  for (const term of commonTerms) await expandTerm(term);
}
