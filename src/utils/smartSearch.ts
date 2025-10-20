// src/utils/smartSearch.ts

// Optional: fallback job vocab
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
];

let fuse: any = null;

/** Expand a search term with synonyms + fuzzy job matches */
export async function expandTerm(term: string): Promise<string[]> {
  const baseTerm = term.trim().toLowerCase();
  const expanded = new Set<string>([baseTerm]);

  // --- 1️⃣ Datamuse API synonyms ---
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(baseTerm)}&max=6`);
    const data = await res.json();
    data.forEach((d: any) => expanded.add(d.word.toLowerCase()));
  } catch (err) {
    console.warn("[expandTerm] Datamuse unavailable", err);
  }

  // --- 2️⃣ Lazy-load Fuse.js for fuzzy matching ---
  if (!fuse) {
    const FuseModule = await import("https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.esm.js");
    const Fuse = (FuseModule as any).default;
    fuse = new Fuse(JOB_VOCAB, { includeScore: true, threshold: 0.35 });
  }

  const fuzzyMatches = fuse.search(baseTerm).map((r: any) => r.item);
  fuzzyMatches.forEach((w: string) => expanded.add(w.toLowerCase()));

  const finalTerms = [...expanded].filter((w) => w.length > 2 && /^[a-z]+$/.test(w));
  console.log(`✨ [smartSearch] Expanded "${term}" → ${finalTerms.length}:`, finalTerms);
  return finalTerms;
}
