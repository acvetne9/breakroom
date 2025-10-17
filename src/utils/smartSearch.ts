import { pipeline } from "@huggingface/transformers";

// Common hospitality terms for expansion
const HOSPITALITY_TERMS = [
  "barista", "manager", "cashier", "server", "cook", "chef", 
  "waiter", "waitress", "host", "hostess", "bartender", "barback",
  "line cook", "dishwasher", "assistant", "supervisor", "lead",
  "team", "crew", "staff", "associate", "representative", "agent",
  "coordinator", "specialist", "technician", "receptionist",
  "secretary", "clerk", "sales", "service", "customer", "food",
  "kitchen", "front", "back", "house", "floor", "delivery",
  "driver", "cleaner", "maintenance", "intern", "trainee",
  "restaurant", "cafe", "coffee", "bar", "hotel", "gym", "salon"
];

// Embedder model (lazy loaded)
let embedder: any = null;

/**
 * Get or load the semantic embedder model
 */
async function getEmbedder() {
  if (!embedder) {
    console.log('🚀 Loading semantic embedder model...');
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log('✅ Embedder model loaded');
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
 * Get semantic embedding for a text
 */
async function getEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Find semantically similar terms using Datamuse API fallback
 */
async function getDatamuseSynonyms(query: string): Promise<string[]> {
  try {
    console.log(`🌐 Fetching Datamuse synonyms for "${query}"...`);
    const response = await fetch(
      `https://api.datamuse.com/words?ml=${encodeURIComponent(query)}&max=10`
    );
    
    if (!response.ok) {
      console.warn('⚠️ Datamuse API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const synonyms = data.map((item: any) => item.word).slice(0, 5);
    console.log(`✅ Datamuse found ${synonyms.length} synonyms:`, synonyms);
    return synonyms;
  } catch (error) {
    console.warn('⚠️ Datamuse API failed:', error);
    return [];
  }
}

/**
 * Expand a search term with semantically similar terms
 * NO CACHE - always runs fresh with full logging
 * 
 * @param query - The search term to expand (e.g., "waitress")
 * @param terms - Optional list of terms to search against (defaults to HOSPITALITY_TERMS)
 * @param threshold - Similarity threshold 0-1 (default 0.6)
 * @returns Promise<string[]> - Array of expanded terms including the original
 */
export async function expandTerm(
  query: string,
  terms: string[] = HOSPITALITY_TERMS,
  threshold: number = 0.6
): Promise<string[]> {
  const cleanQuery = query.toLowerCase().trim();
  
  if (!cleanQuery) {
    console.log('⚠️ Empty query, returning []');
    return [];
  }
  
  console.log(`🔍 [expandTerm] Starting expansion for "${cleanQuery}" (threshold: ${threshold})`);
  
  // Always include the original term
  const results = [cleanQuery];
  
  try {
    // Try semantic expansion with transformers
    console.log(`🤖 Computing embeddings for "${cleanQuery}" and ${terms.length} terms...`);
    const queryEmbedding = await getEmbedding(cleanQuery);
    
    const similarities: Array<{ term: string; score: number }> = [];
    
    // Compute similarities with all terms
    for (const term of terms) {
      const termEmbedding = await getEmbedding(term);
      const similarity = cosineSimilarity(queryEmbedding, termEmbedding);
      
      if (similarity >= threshold) {
        similarities.push({ term, score: similarity });
        console.log(`  ✓ "${term}": ${similarity.toFixed(3)} (above threshold)`);
      }
    }
    
    // Sort by similarity (best first)
    similarities.sort((a, b) => b.score - a.score);
    
    // Add top matches to results
    const expandedTerms = similarities.slice(0, 8).map(s => s.term);
    results.push(...expandedTerms);
    
    console.log(`✅ [expandTerm] Semantic expansion found ${expandedTerms.length} terms:`, expandedTerms);
    
  } catch (error) {
    console.warn('⚠️ Transformer expansion failed, trying Datamuse API fallback...', error);
    
    // Fallback to Datamuse API
    const apiSynonyms = await getDatamuseSynonyms(cleanQuery);
    if (apiSynonyms.length > 0) {
      results.push(...apiSynonyms);
      console.log(`✅ [expandTerm] Datamuse fallback found ${apiSynonyms.length} terms:`, apiSynonyms);
    } else {
      console.log(`⚠️ [expandTerm] No fallback terms found, using only original term`);
    }
  }
  
  // Remove duplicates and return
  const uniqueResults = [...new Set(results)];
  console.log(`🎯 [expandTerm] Final expanded terms for "${cleanQuery}":`, uniqueResults);
  
  return uniqueResults;
}

/**
 * Stub for precomputation - no longer needed without cache
 */
export async function precomputeCommonTerms(): Promise<void> {
  console.log('ℹ️ precomputeCommonTerms is deprecated (no cache), skipping');
  return Promise.resolve();
}
