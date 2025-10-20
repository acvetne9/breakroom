// src/utils/smartSearch.ts
import { pipeline } from "@xenova/transformers";

/* --- Seed vocabulary for workforce/business terms --- */
const SEED_VOCAB = [
  "waiter",
  "waitress",
  "server",
  "barista",
  "bartender",
  "chef",
  "cook",
  "line cook",
  "host",
  "hostess",
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

/* --- Utilities --- */
function normalizeText(input: string): string {
  let t = input.toLowerCase().trim();
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2"); // camelCase -> space
  t = t.replace(/\b(\w*?)(wo)?man\b/g, "$1person"); // salesman -> salesperson
  t = t.replace(/(ess|ette|euse|trix)\b/g, ""); // waitress -> waitr
  t = t.replace(/\bmaid\b/g, "attendant");
  t = t.replace(/\bpolice\s?person\b/g, "police officer");
  t = t.replace(/\bfire\s?person\b/g, "firefighter");
  t = t.replace(/\bmen\b/g, "man");
  t = t.replace(/\bwomen\b/g, "woman");
  t = t.replace(/ies\b/g, "y");
  t = t.replace(/([a-z])s\b/g, "$1");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function ngrams(tokens: string[], maxN = 3): string[] {
  const out: string[] = [];
  for (let n = 1; n <= Math.min(maxN, tokens.length); n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

/* --- Levenshtein similarity --- */
function levenshteinRatio(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
    }
  }
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

/* --- Cosine similarity for embeddings --- */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/* --- Browser-compatible embeddings --- */
let _embedder: any = null;
async function getEmbedder() {
  if (!_embedder) {
    _embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return _embedder;
}
async function getEmbedding(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const result = await embedder(text, { pooling: "mean", normalize: true });
  return result[0]; // 1D embedding array
}

/* --- TF-IDF-like helpers --- */
function buildTF(tokens: string[]) {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}
function buildVocabulary(docs: string[][]) {
  const vocab = new Set<string>();
  for (const doc of docs) for (const token of doc) vocab.add(token);
  return Array.from(vocab);
}
function tfidfVectors(docsTokens: string[][]) {
  const N = docsTokens.length;
  const df: Record<string, number> = {};
  for (const doc of docsTokens) {
    const seen = new Set<string>();
    for (const t of doc) {
      if (!seen.has(t)) {
        df[t] = (df[t] || 0) + 1;
        seen.add(t);
      }
    }
  }
  const vocab = buildVocabulary(docsTokens);
  const idf: Record<string, number> = {};
  for (const term of vocab) {
    idf[term] = Math.log(1 + N / (1 + (df[term] || 0)));
  }
  const vecs: Record<string, number>[] = docsTokens.map((doc) => {
    const tf = buildTF(doc);
    const vec: Record<string, number> = {};
    for (const t of vocab) vec[t] = tf[t] ? tf[t] * idf[t] : 0;
    return vec;
  });
  return { vocab, idf, vecs };
}
function cosineVec(a: Record<string, number>, b: Record<string, number>) {
  let dot = 0,
    na = 0,
    nb = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] || 0;
    const bv = b[k] || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/* --- Main dynamic smart search --- */
export async function expandTerm(query: string, options?: { maxResults?: number }) {
  if (!query.trim()) return [];
  const maxResults = options?.maxResults ?? 8;

  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const grams = ngrams(tokens, 3);

  // Collect candidate pool: seed vocab + n-grams recombinations
  const candidates = new Set<string>();
  for (const g of grams) candidates.add(g);
  for (const v of SEED_VOCAB) candidates.add(v);

  // Morphological expansions (optional)
  const appendCommon = ["clerk", "assistant", "manager", "worker", "staff", "agent", "company", "firm", "business"];
  for (const g of grams) for (const a of appendCommon) candidates.add(`${g} ${a}`);

  const candArray = Array.from(candidates);
  const queryEmbedding = await getEmbedding(query);

  // Compute semantic + fuzzy scores
  const scored = await Promise.all(
    candArray.map(async (cand) => {
      const emb = await getEmbedding(cand);
      const semantic = cosineSim(queryEmbedding, emb);
      const fuzzy = levenshteinRatio(normalizedQuery, normalizeText(cand));
      const score = 0.7 * semantic + 0.3 * fuzzy;
      return { term: cand, score };
    }),
  );

  scored.sort((a, b) => b.score - a.score);

  const results: string[] = [];
  const unique = new Set<string>();
  results.push(query); // always include original
  unique.add(query);

  for (const item of scored) {
    if (results.length >= maxResults) break;
    if (!unique.has(item.term)) {
      results.push(item.term);
      unique.add(item.term);
    }
  }

  return results;
}
