// src/utils/smartSearch.ts
// Browser-safe, workforce-oriented synonym expansion.
// Expands job roles dynamically using Datamuse's concept API.

type CacheEntry = { data: string[]; timestamp: number };
const CACHE: Record<string, CacheEntry> = {};
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours

// Exclude these from results
const EXCLUDED_TERMS = new Set([
  "girl",
  "boy",
  "woman",
  "man",
  "lady",
  "gentleman",
  "maid",
  "barmaid",
  "mistress",
  "wench",
  "heroine",
  "hostess",
  "queen",
  "princess",
  "wife",
  "husband",
  "bride",
  "groom",
]);

// Role-related keyword whitelist — ensures workforce context
const WORKFORCE_KEYWORDS = [
  "work",
  "job",
  "position",
  "staff",
  "role",
  "employee",
  "team",
  "career",
  "occupation",
  "profession",
  "trade",
  "service",
  "technician",
  "engineer",
  "cook",
  "chef",
  "server",
  "waiter",
  "manager",
  "supervisor",
  "barista",
  "bartender",
  "attendant",
  "associate",
  "specialist",
  "assistant",
  "operator",
  "worker",
  "teacher",
  "instructor",
  "driver",
  "sales",
  "representative",
  "agent",
  "technician",
  "laborer",
  "clerk",
  "developer",
];

/**
 * Fetches Datamuse results safely with caching.
 */
async function fetchDatamuse(term: string, params: string): Promise<string[]> {
  const key = `${term}:${params}`;
  const now = Date.now();

  if (CACHE[key] && now - CACHE[key].timestamp < CACHE_TTL) {
    return CACHE[key].data;
  }

  try {
    const res = await fetch(`https://api.datamuse.com/words?${params}&max=8`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const words = data
      .map((w: any) => w.word.toLowerCase())
      .filter((w: string) => /^[a-z\s]+$/.test(w) && w.length > 2);
    CACHE[key] = { data: words, timestamp: now };
    return words;
  } catch (err) {
    console.warn(`[smartSearch] Datamuse fetch failed for ${term}:`, err);
    return [];
  }
}

/**
 * Expands one or more search terms into related workforce terms.
 */
export async function expandTerm(input: string): Promise<string[]> {
  console.log("🔍 [smartSearch] Expanding search for:", input);

  const baseTerms = input.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(baseTerms);

  for (const term of baseTerms) {
    const [related, synonyms, fuzzy] = await Promise.all([
      fetchDatamuse(term, `rel_jja=${term}`), // adjectives used with
      fetchDatamuse(term, `ml=${term}`), // meaning-like
      fetchDatamuse(term, `sp=${term}*`), // fuzzy match
    ]);

    const candidates = [...related, ...synonyms, ...fuzzy];

    for (const word of candidates) {
      if (!EXCLUDED_TERMS.has(word) && isWorkforceRelated(word) && isSimilar(term, word)) {
        expanded.add(word);
      }
    }
  }

  const results = Array.from(expanded);
  console.log(`✨ [smartSearch] Expanded ${baseTerms.length} → ${results.length}:`, results);
  return results;
}

/**
 * Filters out unrelated non-workforce words.
 */
function isWorkforceRelated(word: string): boolean {
  return WORKFORCE_KEYWORDS.some((kw) => word.includes(kw)) || /\b(er|ist|or|ian|ant|ent|ive|ess)\b/.test(word); // common role suffixes
}

/**
 * Fuzzy similarity using Levenshtein distance.
 */
function isSimilar(a: string, b: string): boolean {
  const dist = levenshtein(a, b);
  const threshold = Math.ceil(Math.max(a.length, b.length) * 0.6);
  return dist <= threshold || a[0] === b[0];
}

/**
 * Levenshtein distance
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
