// src/utils/smartSearch.ts
import Fuse from "fuse.js";
import stringSimilarity from "string-similarity";

// Example dataset — this can be fetched from server or replaced dynamically
const WORKFORCE_DATASET = [
  "waiter",
  "server",
  "bartender",
  "barista",
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

/* --- Utilities --- */
function normalizeText(input: string): string {
  let t = input.toLowerCase().trim();
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
  t = t.replace(/\b(\w*?)(wo)?man\b/g, "$1person"); // salesman -> salesperson
  t = t.replace(/(ess|ette|euse|trix)\b/g, ""); // waitress -> waitr
  t = t.replace(/\bmaid\b/g, "attendant"); // maid -> attendant
  t = t.replace(/\bpolice\s?person\b/g, "police officer");
  t = t.replace(/\bfire\s?person\b/g, "firefighter");
  t = t.replace(/\bmen\b/g, "man");
  t = t.replace(/\bwomen\b/g, "woman");
  t = t.replace(/ies\b/g, "y");
  t = t.replace(/([a-z])s\b/g, "$1");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/* --- Main exported function --- */
export function expandTerm(query: string, options?: { maxResults?: number; dataset?: string[] }): string[] {
  if (!query || !query.trim()) return [];

  const dataset = options?.dataset || WORKFORCE_DATASET;
  const maxResults = options?.maxResults ?? 8;
  const normalizedQuery = normalizeText(query);

  // 1) Fuzzy match using Fuse.js
  const fuse = new Fuse(dataset, {
    includeScore: true,
    threshold: 0.4, // adjust sensitivity
    ignoreLocation: true,
  });
  const fuseResults = fuse.search(normalizedQuery).map((r) => r.item);

  // 2) Smart synonym boost using string similarity
  const similarityScores = dataset.map((item) => ({
    term: item,
    score: stringSimilarity.compareTwoStrings(normalizedQuery, normalizeText(item)),
  }));
  similarityScores.sort((a, b) => b.score - a.score);
  const similarityResults = similarityScores.map((r) => r.term);

  // 3) Combine results (Fuse + similarity) and deduplicate
  const combined = Array.from(new Set([...fuseResults, ...similarityResults]));

  // 4) Ensure the original query is included at the top
  const results: string[] = [query.trim()];
  for (const term of combined) {
    if (results.length >= maxResults) break;
    if (!results.includes(term)) results.push(term);
  }

  return results;
}
