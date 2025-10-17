import natural from "natural";
import { distance as levenshtein } from "fastest-levenshtein";

const tokenizer = new natural.WordTokenizer();

// Simple fuzzy + semantic similarity measure
function similarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();

  if (a === b) return 1;

  const levSim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const soundexA = natural.SoundEx.process(a);
  const soundexB = natural.SoundEx.process(b);
  const soundexSim = soundexA === soundexB ? 0.8 : 0;

  return Math.max(levSim, soundexSim);
}

// Break phrases into word vectors and compare averaged similarity
export function multiWordSimilarity(termA: string, termB: string): number {
  const tokensA = tokenizer.tokenize(termA);
  const tokensB = tokenizer.tokenize(termB);

  if (!tokensA.length || !tokensB.length) return 0;

  let total = 0;
  let count = 0;

  for (const wordA of tokensA) {
    let best = 0;
    for (const wordB of tokensB) {
      best = Math.max(best, similarity(wordA, wordB));
    }
    total += best;
    count++;
  }

  return total / count;
}

/**
 * Finds terms from a list that are semantically or fuzzily similar.
 * @param query - The search input (e.g., "waitress")
 * @param terms - The list of terms to compare against
 * @param threshold - How similar a term must be to count (0–1)
 */
export function expandTerm(query: string, terms: string[], threshold = 0.6): string[] {
  if (!query.trim()) return [];

  const results = terms
    .map((term) => ({
      term,
      score: multiWordSimilarity(query, term),
    }))
    .filter((t) => t.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map((t) => t.term);

  return results;
}
