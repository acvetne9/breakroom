import Fuse from "fuse.js";

// Broad workforce-related vocabulary
const JOB_VOCAB = [
  "waiter",
  "waitress",
  "server",
  "bartender",
  "chef",
  "cook",
  "manager",
  "barista",
  "cashier",
  "host",
  "dishwasher",
  "receptionist",
  "housekeeper",
  "driver",
  "teacher",
  "developer",
  "designer",
  "nurse",
  "doctor",
  "mechanic",
  "electrician",
  "technician",
  "construction worker",
  "janitor",
  "security guard",
  "salesperson",
  "assistant",
  "customer service",
  "delivery driver",
  "truck driver",
  "engineer",
  "plumber",
  "cleaner",
  "supervisor",
  "warehouse associate",
  "line cook",
  "busser",
  "barback",
  "hostess",
];

// Fuzzy matcher setup
const fuse = new Fuse(JOB_VOCAB, { includeScore: true, threshold: 0.35 });

// Terms to exclude (gendered or irrelevant)
const EXCLUSION_REGEX =
  /\b(girl|boy|maid|mistress|master|barmaid|hostess|mademoiselle|lady|gentleman|sir|miss|mrs|ms|wench|servant)\b/i;

/** Expand a search term with workforce-focused synonyms and fuzzy matches */
export async function expandTerm(term: string): Promise<string[]> {
  const baseTerm = term.trim().toLowerCase();
  const expanded = new Set<string>([baseTerm]);

  // 1️⃣ Get conceptual synonyms from Datamuse
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(baseTerm)}&max=12`);
    const data = await res.json();
    for (const item of data) {
      const word = item.word.toLowerCase();
      if (!EXCLUSION_REGEX.test(word) && /^[a-z\s]+$/.test(word)) {
        expanded.add(word);
      }
    }
  } catch (err) {
    console.warn("[expandTerm] Datamuse unavailable", err);
  }

  // 2️⃣ Add fuzzy matches from known workforce vocab
  const fuzzyMatches = fuse.search(baseTerm).map((r) => r.item);
  for (const match of fuzzyMatches) expanded.add(match.toLowerCase());

  // 3️⃣ Filter irrelevant / too-short results
  const finalTerms = [...expanded].filter((w) => w.length > 2 && /^[a-z\s]+$/.test(w) && !EXCLUSION_REGEX.test(w));

  console.log(`✨ [smartSearch] Expanded "${term}" → ${finalTerms.length}:`, finalTerms);
  return finalTerms;
}
