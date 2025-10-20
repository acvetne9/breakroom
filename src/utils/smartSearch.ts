// ✅ Browser-safe "Smart Search" system with synonym + fuzzy logic
// Imports a large curated synonym dataset, plus uses embeddings for unseen roles

import JOB_SYNONYMS from "./jobSynonyms.json";

// Lightweight fuzzy matching library (works in browser)
import Fuse from "fuse.js";

// --- Mock free embedding function (browser-safe) ---
// Uses cosine similarity between small vectors to simulate semantic similarity
// In production, you can replace this with a real model like Hugging Face Inference API if desired
const mockEmbedding = (text: string): number[] => {
  // Simple deterministic hash → embedding (no external calls)
  const chars = text.toLowerCase().split("");
  return Array.from({ length: 16 }, (_, i) => chars.reduce((sum, c, j) => sum + c.charCodeAt(0) * Math.sin(i + j), 0));
};

const cosineSim = (a: number[], b: number[]): number => {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
  return dot / (magA * magB);
};

// --- Fuzzy setup ---
const fuseOptions = {
  includeScore: true,
  threshold: 0.35, // tighter than default (more relevant)
};
const fuse = new Fuse(Object.keys(JOB_SYNONYMS), fuseOptions);

// --- Core function ---
export async function expandTerm(input: string): Promise<string[]> {
  const term = input.toLowerCase().trim();

  console.log(`🔍 [smartSearch] Expanding "${term}"`);

  // 1️⃣ Direct matches from JOB_SYNONYMS
  const directMatches = JOB_SYNONYMS[term] || [];

  // 2️⃣ Fuzzy search (catch misspellings / near-matches)
  const fuzzyResults = fuse.search(term);
  const fuzzyMatches = fuzzyResults.filter((r) => r.score && r.score < 0.35).map((r) => r.item);

  // 3️⃣ Semantic similarity fallback (dynamic discovery)
  const inputVec = mockEmbedding(term);
  const semanticMatches = Object.keys(JOB_SYNONYMS)
    .map((word) => ({
      word,
      score: cosineSim(inputVec, mockEmbedding(word)),
    }))
    .filter((x) => x.score > 0.9 && x.word !== term)
    .map((x) => x.word);

  // Combine and deduplicate
  const allMatches = Array.from(new Set([term, ...directMatches, ...fuzzyMatches, ...semanticMatches]));

  console.log(`✨ [smartSearch] Expanded "${term}" → ${allMatches.length}:`, allMatches);
  return allMatches;
}
