// smartSearch.js
// Browser-safe synonym + fuzzy expansion for workforce search
// Free + uses Datamuse API for semantic synonyms + Fuse.js for fuzzy

// Import Fuse.js (browser-safe fuzzy search)
import Fuse from "https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.esm.js";

// Optional — preload a lightweight common job vocabulary for fuzzy matching
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
  "barback",
  "dishwasher",
  "housekeeper",
  "receptionist",
  "nurse",
  "doctor",
  "teacher",
  "professor",
  "driver",
  "mechanic",
  "engineer",
  "developer",
  "salesperson",
  "accountant",
  "designer",
  "artist",
  "actor",
  "writer",
  "director",
  "security",
  "janitor",
  "cleaner",
  "technician",
  "plumber",
  "electrician",
  "carpenter",
];

// Fuzzy setup
const fuse = new Fuse(JOB_VOCAB, {
  includeScore: true,
  threshold: 0.35, // controls how loose the fuzzy matching is
});

/**
 * Expand a single search term using:
 *  1. Datamuse API (semantic synonyms)
 *  2. Fuzzy local similarity (Fuse.js)
 */
export async function expandTerm(term) {
  const baseTerm = term.trim().toLowerCase();
  const expanded = new Set([baseTerm]);

  // --- 1️⃣ Datamuse API: get synonyms / related words ---
  try {
    const response = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(baseTerm)}&max=6`);
    const data = await response.json();
    data.forEach((item) => expanded.add(item.word.toLowerCase()));
  } catch (e) {
    console.warn("[expandTerm] Datamuse API unavailable, skipping synonyms", e);
  }

  // --- 2️⃣ Fuzzy local expansion ---
  const fuzzyMatches = fuse.search(baseTerm).map((result) => result.item);
  fuzzyMatches.forEach((word) => expanded.add(word.toLowerCase()));

  // --- 3️⃣ Clean + dedupe ---
  const finalTerms = [...expanded].filter(
    (w) => w.length > 2 && !/[^a-z]/.test(w), // remove junk or non-alpha
  );

  console.log(`✨ [smartSearch] Expanded "${term}" → ${finalTerms.length}:`, finalTerms);
  return finalTerms;
}
