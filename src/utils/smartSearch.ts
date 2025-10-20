import Fuse from "fuse.js";

// Core job vocabulary — broad and scalable
const JOB_VOCAB = [
  "waiter",
  "server",
  "bartender",
  "barista",
  "cook",
  "chef",
  "manager",
  "cashier",
  "host",
  "hostess",
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
  "delivery driver",
  "engineer",
  "plumber",
  "cleaner",
  "supervisor",
  "warehouse worker",
  "line cook",
  "busser",
  "barback",
  "customer service",
  "developer",
  "software engineer",
  "nail technician",
  "stylist",
  "waitstaff",
];

// Fuzzy matcher setup for scoring relevance
const fuse = new Fuse(JOB_VOCAB, {
  includeScore: true,
  threshold: 0.35,
});

// Exclude non-professional or gendered terms
const EXCLUSION_REGEX = /\b(girl|boy|maid|mistress|master|lady|gentleman|sir|miss|mrs|ms|wench|servant|helper)\b/i;

/** Expands a job title or role term using free APIs + fuzzy filtering */
export async function expandTerm(term: string): Promise<string[]> {
  const baseTerm = term.trim().toLowerCase();
  const expanded = new Set<string>([baseTerm]);

  // 1️⃣ Get conceptual synonyms from Datamuse
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(baseTerm)}&max=15`);
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

  // 2️⃣ Add fuzzy matches from the job vocab
  const fuzzyMatches = fuse.search(baseTerm).map((r) => r.item);
  for (const match of fuzzyMatches) expanded.add(match.toLowerCase());

  // 3️⃣ Filter irrelevant synonyms (e.g., “attendant”, “helper”) by job-similarity score
  const scored = [...expanded]
    .map((word) => ({
      word,
      score: fuse.search(word)[0]?.score ?? 1, // lower = more similar
    }))
    .filter((entry) => entry.score < 0.4) // only job-like terms
    .map((entry) => entry.word);

  // 4️⃣ Cleanup
  const finalTerms = Array.from(new Set(scored)).filter(
    (w) => w.length > 2 && /^[a-z\s]+$/.test(w) && !EXCLUSION_REGEX.test(w),
  );

  console.log(`✨ [smartSearch] Expanded "${term}" → ${finalTerms.length}:`, finalTerms);
  return finalTerms;
}
