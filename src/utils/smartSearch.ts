// --- Basic Levenshtein distance implementation (no imports) ---
function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return matrix[a.length][b.length];
}

// --- Word similarity combining fuzzy, plural, and suffix matching ---
function wordSimilarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();

  if (a === b) return 1;
  if (a.endsWith("s") && a.slice(0, -1) === b) return 0.95;
  if (b.endsWith("s") && b.slice(0, -1) === a) return 0.95;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const score = 1 - distance / maxLen;

  return score;
}

// --- Compare multi-word terms ---
export function multiWordSimilarity(termA: string, termB: string): number {
  const tokensA = termA.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = termB.toLowerCase().split(/\s+/).filter(Boolean);

  if (!tokensA.length || !tokensB.length) return 0;

  let total = 0;
  let count = 0;

  for (const wordA of tokensA) {
    let best = 0;
    for (const wordB of tokensB) {
      best = Math.max(best, wordSimilarity(wordA, wordB));
    }
    total += best;
    count++;
  }

  return total / count;
}

// --- Find similar terms from a list ---
export function findSimilarTerms(query: string, terms: string[], threshold = 0.6): string[] {
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
