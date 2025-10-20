import natural from "natural";
const { WordNet, PorterStemmer, DoubleMetaphone, LevenshteinDistance } = natural;
const wordnet = new WordNet();

/**
 * Lightweight seed vocabulary — NOT a hard mapping.
 * It's used to enable fuzzy+phonetic matches across common workforce words.
 * You can expand this list over time automatically from your dataset,
 * it's not used as the only source of truth.
 */
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

  // split camelCase if any
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");

  // gender neutralization (generic rules, not exhaustive)
  t = t.replace(/\b(\w*?)(wo)?man\b/g, "$1person"); // salesman -> salesperson
  t = t.replace(/(ess|ette|euse|trix)\b/g, ""); // waitress -> waitr -> will stem to waiter
  t = t.replace(/\bmaid\b/g, "attendant"); // maid -> attendant
  t = t.replace(/\bpolice\s?person\b/g, "police officer");
  t = t.replace(/\bfire\s?person\b/g, "firefighter");

  // plural simplifications
  t = t.replace(/\bmen\b/g, "man");
  t = t.replace(/\bwomen\b/g, "woman");
  t = t.replace(/ies\b/g, "y");
  t = t.replace(/([a-z])s\b/g, "$1"); // naive: removes trailing s

  // normalize whitespace
  t = t.replace(/\s+/g, " ").trim();

  // stem each token
  const stemmed = t
    .split(" ")
    .map((w) => PorterStemmer.stem(w))
    .join(" ");
  return stemmed;
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

function levenshteinRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const d = LevenshteinDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function doubleMetaphoneMatches(a: string, b: string): boolean {
  const dm = new (DoubleMetaphone as any)(); // cast to any to bypass TS issues
  const [a1, a2] = dm.process(a); // use `process` method on instance
  const [b1, b2] = dm.process(b);
  return (!!a1 && a1 === b1) || (!!a2 && a2 === b2);
}

/* --- WordNet lookup wrapper --- */
function lookupWordnet(term: string): Promise<string[]> {
  return new Promise((resolve) => {
    // WordNet.lookup returns synsets for any token/phrase
    wordnet.lookup(term, (results: any[]) => {
      const out = new Set<string>();
      for (const r of results || []) {
        for (const s of r.synonyms || []) {
          // convert underscore multiwords and ignore odd tokens
          const cleaned = s.replace(/_/g, " ").toLowerCase();
          if (cleaned && cleaned.length > 1) out.add(cleaned);
        }
      }
      resolve(Array.from(out));
    });
  });
}

/* --- Vector helpers for TF-IDF-like ranking --- */
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
    for (const t of vocab) {
      if (tf[t]) vec[t] = tf[t] * idf[t];
      else vec[t] = 0;
    }
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
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

/* --- Main exported function --- */

/**
 * Expand a workforce-oriented query to conceptually similar job/business terms.
 * Returns top candidates (includes normalized original).
 *
 * Weighted ranking:
 *  - tfidfCosineWeight: 0.6
 *  - fuzzyWeight: 0.3
 *  - phoneticBoost: 0.1
 */
export async function expandTerm(query: string, options?: { maxResults?: number }) {
  if (!query || !query.trim()) return [];

  const maxResults = options?.maxResults ?? 8;
  const originalNormalized = normalizeText(query);
  const tokens = originalNormalized.split(" ").filter(Boolean);
  const grams = ngrams(tokens, 3); // 1..3-grams

  // 1) collect candidates: WordNet synonyms for each ngram
  const candidates = new Set<string>();
  for (const g of grams) {
    const wn = await lookupWordnet(g);
    wn.forEach((s) => candidates.add(s));
    // also include the raw ngram itself (non-stemmed form)
    candidates.add(g);
  }

  // 2) fuzzy + phonetic matches from seed vocab (adds robustness for real workforce terms)
  const normalizedQueryNoStem = query.toLowerCase().trim();
  for (const v of SEED_VOCAB) {
    const vNorm = normalizeText(v);
    const lev = levenshteinRatio(normalizedQueryNoStem, v);
    if (lev >= 0.7) candidates.add(v); // close typo match
    if (doubleMetaphoneMatches(normalizedQueryNoStem, v)) candidates.add(v); // phonetic
    // also compare to each ngram
    for (const g of grams) {
      if (levenshteinRatio(g, vNorm) >= 0.75) candidates.add(v);
      if (doubleMetaphoneMatches(g, v)) candidates.add(v);
    }
  }

  // 3) morphological expansions: recompose tokens (e.g., "front desk" -> "front desk clerk")
  // Generate simple recompositions by appending common workforce nouns if meaningful
  const appendCommon = ["clerk", "assistant", "manager", "worker", "staff", "agent", "company", "firm", "business"];
  for (const g of grams) {
    for (const a of appendCommon) {
      candidates.add(`${g} ${a}`);
    }
  }

  // Convert candidate set to array and prepare token lists for vectorizing
  const candArray = Array.from(candidates).map((c) => c.toLowerCase());
  // tokenize and stem each candidate for bag-of-words
  const docsTokens = candArray.map((c) =>
    c
      .replace(/_/g, " ")
      .split(/\s+/)
      .map((w) => PorterStemmer.stem(w))
      .filter(Boolean),
  );

  // include query (stemmed tokens) as first doc to compute tf-idf
  const queryTokens = originalNormalized.split(" ").filter(Boolean);
  const allDocsTokens = [queryTokens, ...docsTokens];

  // 4) compute tf-idf vectors
  const { vecs } = tfidfVectors(allDocsTokens); // vecs[0] corresponds to query
  const queryVec = vecs[0];

  // 5) score candidates
  const scored: { term: string; score: number; details?: any }[] = [];
  for (let i = 0; i < candArray.length; i++) {
    const cand = candArray[i];
    const candVec = vecs[i + 1];

    const tfidfCosine = cosineVec(queryVec, candVec); // 0..1
    const fuzzy = Math.max(
      levenshteinRatio(originalNormalized, normalizeText(cand)),
      ...grams.map((g) => levenshteinRatio(g, normalizeText(cand))),
    );
    const phonetic = doubleMetaphoneMatches(originalNormalized, cand) ? 1 : 0;

    // Weighted score
    const score = 0.6 * tfidfCosine + 0.3 * fuzzy + 0.1 * phonetic;
    scored.push({ term: cand, score, details: { tfidfCosine, fuzzy, phonetic } });
  }

  // sort and pick top results
  scored.sort((a, b) => b.score - a.score);

  // ensure normalized original is present near top
  const normalizedOriginalReadable = query.trim().toLowerCase();
  const unique = new Map<string, number>();
  const results: string[] = [];

  // add original readable first
  results.push(normalizedOriginalReadable);
  unique.set(normalizedOriginalReadable, 1);

  for (const item of scored) {
    if (results.length >= maxResults) break;
    const t = item.term;
    // push more readable (unstemmed) variant: attempt to find original form if underscores exist
    const readable = t.replace(/_/g, " ");
    if (!unique.has(readable)) {
      results.push(readable);
      unique.set(readable, 1);
    }
  }

  return results;
}
