import { pipeline } from "@huggingface/transformers";

/**
 * Common work-related and hospitality terms used for broad semantic expansion.
 * You can extend this list freely — it acts as your base search vocabulary.
 */
const BASE_TERMS = [
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
  "business",
  "work",
  "office",
  "team member",
  "customer service",
  "assistant manager",
  "service worker",
  "retail associate",
];

/** Lazy-loaded embedder model */
let embedder: any = null;

/**
 * Get or load the HuggingFace embedder
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
 * Normalize words: remove gendered, plural, or role suffixes for broader matching
 */
function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/(ess|ette|trix|man|men|woman|women|s)$/gi, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
}

/**
 * Compute cosine similarity between two embedding vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    na += vecA[i] * vecA[i];
    nb += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Get a semantic embedding for a text or phrase
 */
async function getEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const words = text
    .split(/\s+/)
    .map((w) => normalize(w))
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

  // Average embeddings for multi-word phrases
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const meanEmbedding = new Array(dim).fill(0);
  for (const vec of embeddings) {
    for (let i = 0; i < dim; i++) meanEmbedding[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) meanEmbedding[i] /= embeddings.length;
  return meanEmbedding;
}

/**
 * Fallback fuzzy matching using character-level similarity (Levenshtein ratio)
 */
function similarityScore(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function editDistance(a: string, b: string): number {
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
 * Expand a search term by semantic similarity and fuzzy matching.
 * Works offline and handles multi-word inputs.
 */
export async function expandTerm(query: string, terms: string[] = BASE_TERMS, threshold = 0.6): Promise<string[]> {
  if (!query) return [];
  const normalizedQuery = normalize(query);
  const results = new Set<string>([normalizedQuery]);

  console.log(`\n🔍 Expanding term: "${query}" → normalized: "${normalizedQuery}"`);

  try {
    const queryEmbedding = await getEmbedding(normalizedQuery);
    if (queryEmbedding.length === 0) throw new Error("No embedding for query");

    const similarities: Array<{ term: string; score: number }> = [];

    for (const term of terms) {
      const normTerm = normalize(term);
      const termEmbedding = await getEmbedding(normTerm);
      if (termEmbedding.length === 0) continue;

      const score = cosineSimilarity(queryEmbedding, termEmbedding);
      similarities.push({ term, score });
    }

    similarities
      .sort((a, b) => b.score - a.score)
      .filter((s) => s.score >= threshold)
      .forEach((s) => results.add(s.term));

    console.log(`✅ Semantic matches for "${query}":`, Array.from(results));
  } catch (err) {
    console.warn("⚠️ Semantic model failed, falling back to fuzzy matching:", err);

    for (const term of terms) {
      const normTerm = normalize(term);
      if (similarityScore(normalizedQuery, normTerm) > threshold) {
        results.add(term);
      }
    }
  }

  return Array.from(results);
}

/**
 * Deprecated: precompute cache (not needed anymore)
 */
export async function precomputeCommonTerms(): Promise<void> {
  console.log("ℹ️ precomputeCommonTerms is deprecated — no cache used");
  return Promise.resolve();
}
