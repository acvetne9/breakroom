import natural from "natural";
const { WordNet, PorterStemmer, LevenshteinDistance } = natural;
const wordnet = new WordNet();

/**
 * Normalize and stem multiword roles or business terms.
 * Handles gender, plural, and word variants dynamically.
 */
function normalizeRoleTerm(input: string): string {
  let term = input.toLowerCase().trim();

  // Gender-neutral replacements
  term = term
    // Replace gendered -man/-woman endings
    .replace(/\b(\w*?)(wo)?man\b/g, "$1person")
    // Feminine suffixes: waitress → waiter, actress → actor, hostess → host
    .replace(/(ess|ette|euse|trix)\b/g, "")
    // Maid → attendant
    .replace(/\bmaid\b/g, "attendant")
    // Contextual professions
    .replace(/\bpolice\s?person\b/g, "police officer")
    .replace(/\bfire\s?person\b/g, "firefighter");

  // Plural normalization
  term = term
    .replace(/\bmen\b/g, "man")
    .replace(/\bwomen\b/g, "woman")
    .replace(/ies\b/g, "y")
    .replace(/s\b/g, "");

  // Normalize spacing
  term = term.replace(/\s+/g, " ").trim();

  // Stem each word in multiword phrase
  const stemmedWords = term
    .split(" ")
    .map((w) => PorterStemmer.stem(w))
    .filter(Boolean);

  return stemmedWords.join(" ");
}

/**
 * Create a bag-of-words frequency vector
 */
function getVector(text: string): Record<string, number> {
  const words = text.split(/\s+/);
  const vec: Record<string, number> = {};
  for (const w of words) vec[w] = (vec[w] || 0) + 1;
  return vec;
}

/**
 * Cosine similarity between bag-of-words vectors
 */
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0,
    normA = 0,
    normB = 0;
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * Fuzzy similarity score based on Levenshtein ratio
 */
function similarityScore(a: string, b: string): number {
  const dist = LevenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/**
 * Get WordNet synonyms (free, local)
 */
async function getWordnetSynonyms(term: string): Promise<string[]> {
  return new Promise((resolve) => {
    wordnet.lookup(term, (results) => {
      const syns = new Set<string>();
      for (const r of results) {
        for (const s of r.synonyms) {
          if (!s.includes("_")) syns.add(s.toLowerCase());
        }
      }
      resolve([...syns]);
    });
  });
}

/**
 * Expand a query phrase using normalization, multiword logic, and semantic similarity.
 * Returns conceptually related roles or business titles.
 */
export async function expandTerm(query: string, threshold = 0.6): Promise<string[]> {
  if (!query) return [];

  const normalized = normalizeRoleTerm(query);
  console.log(`🔍 Expanding "${query}" → normalized: "${normalized}"`);

  const parts = normalized.split(" ");
  const allSynonyms = new Set<string>();

  // Expand each word and word-pair
  for (let i = 0; i < parts.length; i++) {
    const single = parts[i];
    const syns = await getWordnetSynonyms(single);
    syns.forEach((s) => allSynonyms.add(s));

    // Pair with next word for short phrases
    if (i < parts.length - 1) {
      const phrase = `${parts[i]} ${parts[i + 1]}`;
      const phraseSyns = await getWordnetSynonyms(phrase);
      phraseSyns.forEach((s) => allSynonyms.add(s));
    }
  }

  // Rank by conceptual similarity
  const vecQ = getVector(normalized);
  const scored = Array.from(allSynonyms).map((s) => {
    const sim = 0.6 * cosineSimilarity(vecQ, getVector(normalizeRoleTerm(s))) + 0.4 * similarityScore(normalized, s);
    return [s, sim] as [string, number];
  });

  scored.sort((a, b) => b[1] - a[1]);
  const results = [normalized, ...scored.filter(([_, sc]) => sc >= threshold).map(([w]) => w)];

  console.log(`✅ Expanded "${query}" →`, results);
  return Array.from(new Set(results)).slice(0, 10);
}
