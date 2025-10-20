/* --- Seed vocabulary (lightweight, browser-friendly) --- */
const SEED_VOCAB = [
  "waiter",
  "server",
  "barista",
  "bartender",
  "chef",
  "cook",
  "line cook",
  "host",
  "receptionist",
  "manager",
  "supervisor",
  "cashier",
  "clerk",
  "janitor",
  "custodian",
  "cleaner",
  "housekeeper",
  "stylist",
  "barber",
  "hairdresser",
  "nurse",
  "doctor",
  "teacher",
  "developer",
  "software engineer",
  "data analyst",
  "marketing manager",
  "restaurant",
  "cafe",
  "bistro",
  "construction company",
  "contractor",
  "builder",
  "tech company",
  "startup",
  "law firm",
  "hospital",
  "school",
  "retail",
  "store",
  "warehouse",
  "driver",
  "delivery driver",
];

/* --- Normalize text (gender, plural, suffixes) --- */
function normalizeText(input: string): string {
  let t = input.toLowerCase().trim();

  // split camelCase
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");

  // gender neutralization
  t = t.replace(/\b(\w*?)(wo)?man\b/g, "$1person"); // salesman → salesperson
  t = t.replace(/(ess|ette|euse|trix)\b/g, ""); // waitress → waitr → will match waiter
  t = t.replace(/\bmaid\b/g, "attendant");
  t = t.replace(/\bpolice\s?person\b/g, "police officer");
  t = t.replace(/\bfire\s?person\b/g, "firefighter");

  // plurals
  t = t.replace(/\bmen\b/g, "man");
  t = t.replace(/\bwomen\b/g, "woman");
  t = t.replace(/ies\b/g, "y");
  t = t.replace(/([a-z])s\b/g, "$1");

  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/* --- Ngrams --- */
function ngrams(tokens: string[], maxN = 3): string[] {
  const out: string[] = [];
  for (let n = 1; n <= Math.min(maxN, tokens.length); n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

/* --- Levenshtein ratio --- */
function levenshteinRatio(a: string, b: string): number {
  const lenA = a.length,
    lenB = b.length;
  if (!lenA && !lenB) return 1;

  const dp: number[][] = Array(lenB + 1)
    .fill(0)
    .map(() => Array(lenA + 1).fill(0));
  for (let i = 0; i <= lenB; i++) dp[i][0] = i;
  for (let j = 0; j <= lenA; j++) dp[0][j] = j;

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      dp[i][j] =
        a[j - 1] === b[i - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1);
    }
  }
  return 1 - dp[lenB][lenA] / Math.max(lenA, lenB);
}

/* --- Simple phonetic approximation for browser --- */
function phoneticCode(word: string) {
  return word
    .toLowerCase()
    .replace(/[aeiou]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function phoneticMatch(a: string, b: string) {
  return phoneticCode(a) === phoneticCode(b);
}

/* --- Vocabulary similarity score --- */
function vocabSimilarity(query: string, term: string): number {
  const qNorm = normalizeText(query);
  const tNorm = normalizeText(term);
  
  // Exact match
  if (qNorm === tNorm) return 1.0;
  
  // Contains
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return 0.8;
  
  // Word overlap
  const qWords = new Set(qNorm.split(" "));
  const tWords = new Set(tNorm.split(" "));
  const intersection = [...qWords].filter(w => tWords.has(w)).length;
  const union = new Set([...qWords, ...tWords]).size;
  
  return intersection / union;
}

/* --- Main expandTerm --- */
export async function expandTerm(query: string, options?: { maxResults?: number }) {
  if (!query?.trim()) return [];

  const maxResults = options?.maxResults ?? 8;
  const normQuery = normalizeText(query);
  const tokens = normQuery.split(" ").filter(Boolean);
  const grams = ngrams(tokens, 3);

  const candidates = new Set<string>();
  for (const g of grams) candidates.add(g);
  for (const v of SEED_VOCAB) {
    const vNorm = normalizeText(v);
    if (levenshteinRatio(normQuery, vNorm) >= 0.7) candidates.add(v);
    if (phoneticMatch(normQuery, vNorm)) candidates.add(v);
    for (const g of grams) {
      if (levenshteinRatio(g, vNorm) >= 0.75) candidates.add(v);
      if (phoneticMatch(g, vNorm)) candidates.add(v);
    }
  }

  // Append common workforce nouns for recompositions
  const appendCommon = ["clerk", "assistant", "manager", "worker", "staff", "agent", "company", "firm", "business"];
  for (const g of grams) for (const a of appendCommon) candidates.add(`${g} ${a}`);

  // Score all candidates using lightweight matching
  const candArray = Array.from(candidates);
  const scored: { term: string; score: number }[] = [];
  for (const c of candArray) {
    const vocabScore = vocabSimilarity(normQuery, c);
    const fuzzy = Math.max(
      levenshteinRatio(normQuery, normalizeText(c)),
      ...grams.map((g) => levenshteinRatio(g, normalizeText(c))),
    );
    const phonetic = phoneticMatch(normQuery, normalizeText(c)) ? 1 : 0;
    const score = 0.5 * vocabScore + 0.4 * fuzzy + 0.1 * phonetic;
    scored.push({ term: c, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Return top results
  const results: string[] = [];
  const seen = new Set<string>();
  results.push(query.toLowerCase());
  seen.add(query.toLowerCase());

  for (const s of scored) {
    if (results.length >= maxResults) break;
    if (!seen.has(s.term)) {
      results.push(s.term);
      seen.add(s.term);
    }
  }

  return results;
}
