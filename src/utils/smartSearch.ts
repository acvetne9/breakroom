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
export async function expandTerm(
  query: string,
  terms: string[] = HOSPITALITY_TERMS,
  threshold: number = 0.6,
): Promise<string[]> {
  const cleanQuery = query.toLowerCase().trim();

  if (!cleanQuery) {
    console.log("⚠️ Empty query, returning []");
    return [];
  }

  console.log(`\n==============================`);
  console.log(`🔍 [expandTerm] Expanding: "${cleanQuery}"`);
  console.log(`🧠 Threshold: ${threshold}, Comparing against ${terms.length} terms`);
  console.log(`==============================\n`);

  const results = new Set<string>([cleanQuery]);

  try {
    console.log(`🤖 [embedder] Getting embedding for "${cleanQuery}"...`);
    const queryEmbedding = await getEmbedding(cleanQuery);

    if (queryEmbedding.length === 0) {
      console.warn("⚠️ No embedding produced for query.");
      return [cleanQuery];
    }

    const similarities: Array<{ term: string; score: number }> = [];

    for (const term of terms) {
      const termEmbedding = await getEmbedding(term);
      if (termEmbedding.length === 0) continue;

      const similarity = cosineSimilarity(queryEmbedding, termEmbedding);
      similarities.push({ term, score: similarity });

      // Detailed per-term logging
      if (similarity >= threshold) {
        console.log(`  🟩 "${term}" → ${similarity.toFixed(3)} ✅`);
      } else if (similarity >= threshold * 0.8) {
        console.log(`  🟨 "${term}" → ${similarity.toFixed(3)} (close)`);
      } else {
        console.log(`  ⬜ "${term}" → ${similarity.toFixed(3)}`);
      }
    }

    similarities.sort((a, b) => b.score - a.score);

    const expandedTerms = similarities.filter((s) => s.score >= threshold).map((s) => s.term);

    expandedTerms.forEach((t) => results.add(t));

    console.log(`\n✅ [expandTerm] Semantic expansion found ${expandedTerms.length} terms:`, expandedTerms);
  } catch (error) {
    console.warn(`⚠️ [expandTerm] Transformer failed, using Datamuse fallback...`, error);

    const apiSynonyms = await getDatamuseSynonyms(cleanQuery);
    if (apiSynonyms.length > 0) {
      apiSynonyms.forEach((t) => results.add(t));
      console.log(`✅ [expandTerm] Datamuse added ${apiSynonyms.length} terms`);
    } else {
      console.log(`⚠️ [expandTerm] No terms from fallback.`);
    }
  }

  const finalResults = Array.from(results);
  console.log(`\n🎯 [expandTerm] Final expanded terms for "${cleanQuery}":`);
  finalResults.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));
  console.log(`==============================\n`);

  return finalResults;
}

/**
 * Stub for precomputation - no longer needed without cache
 */
export async function precomputeCommonTerms(): Promise<void> {
  console.log("ℹ️ precomputeCommonTerms is deprecated (no cache), skipping");
  return Promise.resolve();
}
