// smartSearch.ts
// Browser-safe, dynamic synonym + fuzzy job term expansion using Datamuse API.
// Includes gender-neutral filtering and fuzzy matching.

type CacheEntry = { data: string[]; timestamp: number };
const CACHE: Record<string, CacheEntry> = {};
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours

// Gendered / irrelevant words to exclude
const EXCLUDED_TERMS = new Set([
  "girl",
  "boy",
  "woman",
  "man",
  "lady",
  "gentleman",
  "maid",
  "barmaid",
  "housemaid",
  "handmaid",
  "mistress",
  "mastress",
  "waitress", // we’ll include this if it’s the base term
  "wench",
  "heroine",
  "hostess",
  "goddess",
  "queen",
  "princess",
  "wife",
  "husband",
  "bride",
  "groom",
  "actor",
  "actress",
]);

/**
 * Fetches related words from Datamuse with caching.
 */
async function fetchDatamuseWords(term: string, type: "ml" | "sp", limit = 6): Promise<string[]> {
  const key = `${type}:${term}`;
  const now = Date.now();

  if (CACHE[key] && now - CACHE[key].timestamp < CACHE_TTL) {
    return CACHE[key].data;
  }

  try {
    const res = await fetch(`https://api.datamuse.com/words?${type}=${encodeURIComponent(term)}&max=${limit}`);
    if (!res.ok) throw new Error(`Datamuse error ${res.status}`);

    const data = await res.json();
    const words = data
      .map((item: any) => item.word.toLowerCase())
      .filter((w: string) => /^[a-z\s]+$/.test(w) && w.length > 2);

    CACHE[key] = { data: words, timestamp: now };
    return words;
  } catch (err) {
    console.warn(`[smartSearch] Datamuse fetch failed for ${term}:`, err);
    return [];
  }
}

/**
 * Expands a search term with synonyms and fuzzy matches.
 * Filters out gendered and irrelevant terms.
 */
export async function expandTerm(input: string): Promise<string[]> {
  console.log("🔍 [smartSearch] Expanding search for:", input);

  const baseTerms = input.toLowerCase().split(/\s+/).filter(Boolean);

  const expanded = new Set<string>(baseTerms);

  for (const term of baseTerms) {
    const [synonyms, fuzzy] = await Promise.all([fetchDatamuseWords(term, "ml", 8), fetchDatamuseWords(term, "sp", 5)]);

    for (const word of [...synonyms, ...fuzzy]) {
      if (!EXCLUDED_TERMS.has(word) && isSimilar(term, word)) {
        expanded.add(word);
      }
    }
  }

  const result = Array.from(expanded);
  console.log(`✨ [smartSearch] Expanded ${baseTerms.length} terms → ${result.length} total:`, result);
  return result;
}

/**
 * Simple Levenshtein-based similarity check to filter unrelated terms.
 */
function isSimilar(a: string, b: string): boolean {
  const dist = levenshtein(a, b);
  const threshold = Math.ceil(Math.max(a.length, b.length) * 0.6);
  return dist <= threshold;
}

/**
 * Levenshtein distance implementation.
 */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

// Example:
// const expanded = await expandSearchTerms("waitress");
// console.log(expanded);
