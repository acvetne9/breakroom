// smartSearch.ts
// Dynamic synonym + fuzzy search expansion that works fully in the browser.
// Uses Datamuse API (free, no key, no CORS issues).

type CacheEntry = { data: string[]; timestamp: number };
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours
const CACHE: Record<string, CacheEntry> = {};

/**
 * Fetches related words from Datamuse with caching and error handling.
 */
async function fetchDatamuseWords(term: string, type: "ml" | "sp", limit = 6): Promise<string[]> {
  const key = `${type}:${term}`;
  const now = Date.now();

  // Return cached result if available and not stale
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
 * Expands a search query with synonyms and fuzzy matches.
 */
export async function expandSearchTerms(input: string): Promise<string[]> {
  console.log("🔍 [smartSearch] Expanding search for:", input);

  const baseTerms = input.toLowerCase().split(/\s+/).filter(Boolean);

  const expanded = new Set<string>(baseTerms);

  for (const term of baseTerms) {
    // Fetch synonyms (ml = "means like") and fuzzy matches (sp = "spelled like")
    const [synonyms, fuzzy] = await Promise.all([fetchDatamuseWords(term, "ml", 8), fetchDatamuseWords(term, "sp", 5)]);

    for (const word of [...synonyms, ...fuzzy]) {
      // Filter out too-distant terms (e.g., “janitor” for “waitress”) using simple heuristic
      if (word.length > 2 && levenshtein(term, word) < Math.max(term.length, 5)) {
        expanded.add(word);
      }
    }
  }

  const result = Array.from(expanded);
  console.log(`✨ [smartSearch] Expanded ${baseTerms.length} terms → ${result.length} total:`, result);
  return result;
}

/**
 * Simple Levenshtein distance implementation for fuzzy filtering.
 */
function levenshtein(a: string, b: string): number {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

// Example usage (in your search function):
// const expandedTerms = await expandSearchTerms("waitress");
// console.log(expandedTerms);
