import { pipeline } from "@huggingface/transformers";

// Common hospitality terms for expansion
const HOSPITALITY_TERMS = [
  "barista",
  "manager",
  "cashier",
  "server",
  "cook",
  "chef",
  "waiter",
  "waitress",
  "host",
  "hostess",
  "bartender",
  "barback",
  "line cook",
  "dishwasher",
  "assistant",
  "supervisor",
  "lead",
  "team",
  "crew",
  "staff",
  "associate",
  "representative",
  "agent",
  "coordinator",
  "specialist",
  "technician",
  "receptionist",
  "secretary",
  "clerk",
  "sales",
  "service",
  "customer",
  "food",
  "kitchen",
  "front",
  "back",
  "house",
  "floor",
  "delivery",
  "driver",
  "cleaner",
  "maintenance",
  "intern",
  "trainee",
  "restaurant",
  "cafe",
  "coffee",
  "bar",
  "hotel",
  "gym",
  "salon",
];

// Embedder model (lazy loaded)
let embedder: any = null;

/**
 * Get or load the semantic embedder model
 */
async function getEmbedder() {
  if (!embedder) {
    console.log("🚀 Loading semantic embedder model...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("✅ Embedder model loaded");
  }
  return embedder;
}

/**
 * Compute cosine similarity between two embedding vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find semantically similar terms using Datamuse API fallback
 */
async function getDatamuseSynonyms(query: string): Promise<string[]> {
  try {
    console.log(`🌐 Fetching Datamuse synonyms for "${query}"...`);
    const response = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(query)}&max=10`);

    if (!response.ok) {
      console.warn("⚠️ Datamuse API error:", response.status);
      return [];
    }

    const data = await response.json();
    const synonyms = data.map((item: any) => item.word).slice(0, 5);
    console.log(`✅ Datamuse found ${synonyms.length} synonyms:`, synonyms);
    return synonyms;
  } catch (error) {
    console.warn("⚠️ Datamuse API failed:", error);
    return [];
  }
}

/**
 * Get semantic embedding for text.
 * If multi-word, averages embeddings for each word.
 */
async function getEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return [];

  const embeddings: number[][] = [];

  for (const word of words) {
    try {
      const output = await model(word, { pooling: "mean", normalize: true });
      embeddings.push(Array.from(output.data));
    } catch (err) {
      console.warn(`⚠️ Failed to embed "${word}":`, err);
    }
  }

  if (embeddings.length === 0) return [];

  // Average all word embeddings
  const dim = embeddings[0].length;
  const meanEmbedding = new Array(dim).fill(0);
  for (const vec of embeddings) {
    for (let i = 0; i < dim; i++) meanEmbedding[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) meanEmbedding[i] /= embeddings.length;

  return meanEmbedding;
}

/**
 * Expand a term with multi-word semantic and fuzzy logic.
 */
/**
 * Expand a term by finding related or similar words (no imports, no cache).
 * Handles multi-word phrases too.
 */
export async function expandTerm(query, terms = HOSPITALITY_TERMS, threshold = 0.6) {
  if (!query) return [];

  const cleanQuery = query.toLowerCase().trim();
  const results = new Set([cleanQuery]);

  // Split query into words for partial / multi-word matching
  const queryWords = cleanQuery.split(/\s+/);

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();

    // Exact or substring match
    if (lowerTerm.includes(cleanQuery) || cleanQuery.includes(lowerTerm)) {
      results.add(term);
      continue;
    }

    // Word overlap (multi-word handling)
    const termWords = lowerTerm.split(/\s+/);
    const shared = queryWords.filter((w) => termWords.includes(w));
    if (shared.length / Math.max(termWords.length, queryWords.length) > 0.4) {
      results.add(term);
      continue;
    }

    // Simple character-level similarity
    const sim = similarityScore(cleanQuery, lowerTerm);
    if (sim >= threshold) {
      results.add(term);
    }
  }

  return Array.from(results);
}

/**
 * Simple similarity function (Levenshtein ratio approximation)
 */
function similarityScore(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function editDistance(a, b) {
  const dp = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i++) dp[i][0] = i;
  for (let j = 0; j <= a.length; j++) dp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      dp[i][j] =
        b[i - 1] === a[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1);
    }
  }
  return dp[b.length][a.length];
}

/**
 * Stub for precomputation - no longer needed without cache
 */
export async function precomputeCommonTerms(): Promise<void> {
  console.log("ℹ️ precomputeCommonTerms is deprecated (no cache), skipping");
  return Promise.resolve();
}
