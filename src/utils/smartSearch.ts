import Fuse from "fuse.js";

// Light job-related vocabulary for fuzzy similarity
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
  "hostess",
  "dishwasher",
  "housekeeper",
  "receptionist",
  "teacher",
  "developer",
  "designer",
  "driver",
  "engineer",
  "technician",
  "mechanic",
  "salesperson",
  "clerk",
  "supervisor",
  "plumber",
  "electrician",
];

const fuse = new Fuse(JOB_VOCAB, { includeScore: true, threshold: 0.35 });

/** Expand a search term with synonyms + fuzzy job matches */
export async function expandTerm(term: string): Promise<string[]> {
  const baseTerm = term.trim().toLowerCase();
  const expanded = new Set<string>([baseTerm]);

  // 1️⃣ Pull conceptual synonyms from Datamuse API (free)
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(baseTerm)}&max=8`);
    const data = await res.json();
    for (const item of data) {
      const word = item.word.toLowerCase();
      // Filter out gendered or irrelevant terms
      if (!/girl|boy|maid|mistress|master|barmaid|hostess|man|woman/i.test(word)) {
        expanded.add(word);
      }
    }
  } catch (err) {
    console.warn("[expandTerm] Datamuse unavailable", err);
  }

  // 2️⃣ Add fuzzy matches from known job vocab
  const fuzzyMatches = fuse.search(baseTerm).map((r) => r.item);
  for (const match of fuzzyMatches) expanded.add(match.toLowerCase());

  // 3️⃣ Filter cleanup
  const finalTerms = [...expanded].filter((w) => w.length > 2 && /^[a-z\s]+$/.test(w));

  console.log(`✨ [smartSearch] Expanded "${term}" → ${finalTerms.length}:`, finalTerms);
  return finalTerms;
}
