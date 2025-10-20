import { pipeline } from "@huggingface/transformers";

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

/* --- Lazy-loaded semantic embedder --- */
let embedder: any = null;
async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

/* --- Cosine similarity --- */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

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

/* --- Embedding helper --- */
async function getEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const embeddings: number[][] = [];

  for (const w of words) {
    try {
      const out = await model(w, { pooling: "mean", normalize: true });
      embeddings.push(Array.from(out.data));
    } catch {}
  }
  if (!embeddings.length) return [];
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const vec of embeddings) for (let i = 0; i < dim; i++) avg[i] += vec[i];
  for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;
  return avg;
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

  // Semantic similarity ranking
  const candArray = Array.from(candidates);
  const queryEmb = await getEmbedding(normQuery);
  const scored: { term: string; score: number }[] = [];
  for (const c of candArray) {
    const cEmb = await getEmbedding(c);
    const semantic = cEmb.length && queryEmb.length ? cosineSimilarity(queryEmb, cEmb) : 0;
    const fuzzy = Math.max(
      levenshteinRatio(normQuery, normalizeText(c)),
      ...grams.map((g) => levenshteinRatio(g, normalizeText(c))),
    );
    const phonetic = phoneticMatch(normQuery, normalizeText(c)) ? 1 : 0;
    const score = 0.6 * semantic + 0.3 * fuzzy + 0.1 * phonetic;
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
