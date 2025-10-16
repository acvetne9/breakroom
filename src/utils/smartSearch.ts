import nlp from "compromise";
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";
import Fuse from "fuse.js";
import { pipeline } from "@xenova/transformers"; // 🧠 NEW

// Initialize wink-nlp
let winkInstance: any = null;
let winkInitialized = false;

// Initialize transformer model
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

// Initialize cache
loadCache();

/**
 * Fetch synonyms from Datamuse (if online)
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
 * Fuzzy match helper
 */
function fuzzyMatch(term: string, candidates: string[]): string[] {
  const fuse = new Fuse(candidates, { includeScore: true, threshold: 0.4 });
  return fuse.search(term).map((r) => r.item);
}

/**
 * Get semantic neighbors using embeddings
 */
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
  return scores.filter((s) => s.score > 0.55).map((s) => s.term);
}

/**
 * Get word variations and lemmas
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
 * 🔍 Main: Expand a term semantically, fuzzily, and morphologically
 */
export async function expandTerm(term: string): Promise<string[]> {
  const normalized = term.toLowerCase().trim();

  if (isCacheValid(normalized)) {
    const cached = expansionCache.get(normalized);
    if (cached) return cached.terms;
  }

  const expansions = new Set<string>([normalized]);

  // 1️⃣ Datamuse synonyms
  const apiResults = await fetchDatamuseSynonyms(normalized);
  apiResults.forEach((r) => expansions.add(r));

  // 2️⃣ NLP variations + lemmas
  getWordVariations(normalized).forEach((v) => expansions.add(v));
  getLemmas(normalized).forEach((v) => expansions.add(v));

  // 3️⃣ Semantic similarity (local embeddings)
  const allCandidates = Array.from(expansions);
  const semanticNeighbors = await getSemanticNeighbors(normalized, allCandidates);
  semanticNeighbors.forEach((v) => expansions.add(v));

  // 4️⃣ Fuzzy expansion
  const fuzzy = fuzzyMatch(normalized, Array.from(expansions));
  fuzzy.forEach((v) => expansions.add(v));

  // 5️⃣ Cache
  const results = Array.from(expansions);
  expansionCache.set(normalized, { terms: results, timestamp: Date.now() });
  saveCache();

  return results;
}

/**
 * Precompute common hospitality terms in background
 */
export async function precomputeCommonTerms(): Promise<void> {
  const commonTerms = [
    "waitress", "waiter", "server", "bartender", "barista", 
    "cook", "chef", "host", "hostess", "busser", 
    "dishwasher", "manager", "supervisor", "cashier"
  ];
  
  for (const term of commonTerms) {
    await expandTerm(term);
  }
}
