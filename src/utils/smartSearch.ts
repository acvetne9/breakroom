// src/utils/smartSearch.ts
import Fuse from "fuse.js";
import stringSimilarity from "string-similarity";

// Define broad job categories
const JOB_CATEGORIES: Record<string, string[]> = {
  hospitality: [
    "waiter",
    "waitress",
    "server",
    "bartender",
    "barista",
    "chef",
    "cook",
    "host",
    "hostess",
    "dishwasher",
    "busser",
    "sommelier",
  ],
  retail: [
    "cashier",
    "store clerk",
    "sales associate",
    "retail manager",
    "stock clerk",
    "store supervisor",
    "shop assistant",
  ],
  tech: [
    "software engineer",
    "developer",
    "data analyst",
    "data scientist",
    "web developer",
    "product manager",
    "UI designer",
    "UX designer",
  ],
  healthcare: [
    "nurse",
    "doctor",
    "physician",
    "paramedic",
    "surgeon",
    "therapist",
    "pharmacist",
    "dentist",
    "veterinarian",
    "caregiver",
  ],
  education: ["teacher", "professor", "tutor", "instructor", "counselor", "teaching assistant", "coach"],
  maintenance: ["janitor", "custodian", "cleaner", "maintenance worker", "groundskeeper", "handyman", "housekeeper"],
  logistics: ["driver", "truck driver", "delivery driver", "warehouse worker", "forklift operator", "dispatcher"],
  construction: [
    "construction worker",
    "electrician",
    "plumber",
    "carpenter",
    "roofer",
    "welder",
    "painter",
    "mason",
    "architect",
  ],
  finance: [
    "accountant",
    "bookkeeper",
    "financial analyst",
    "bank teller",
    "auditor",
    "loan officer",
    "investment advisor",
  ],
  legal: ["lawyer", "paralegal", "legal assistant", "judge", "court clerk"],
  media: [
    "journalist",
    "writer",
    "editor",
    "photographer",
    "videographer",
    "producer",
    "influencer",
    "graphic designer",
  ],
  arts: ["actor", "actress", "musician", "painter", "dancer", "sculptor", "illustrator", "singer"],
  science: ["scientist", "biologist", "chemist", "physicist", "researcher", "lab technician", "ecologist"],
  public_safety: [
    "police officer",
    "firefighter",
    "security guard",
    "paramedic",
    "dispatcher",
    "detective",
    "lifeguard",
  ],
  admin: ["receptionist", "office clerk", "secretary", "assistant", "administrative assistant", "data entry clerk"],
};

// Flatten for quick lookup
const ALL_JOBS = Object.values(JOB_CATEGORIES).flat();

function getCategory(term: string): string | null {
  const lower = term.toLowerCase();
  for (const [category, jobs] of Object.entries(JOB_CATEGORIES)) {
    if (jobs.includes(lower)) return category;
  }

  // Fallback: fuzzy match to closest category
  const bestCategory = stringSimilarity.findBestMatch(lower, Object.keys(JOB_CATEGORIES));
  return bestCategory.bestMatch.rating > 0.4 ? bestCategory.bestMatch.target : null;
}

export function expandTerm(term: string): string[] {
  const cleanTerm = term.toLowerCase();
  const category = getCategory(cleanTerm);

  if (!category) {
    console.warn(`[expandTerm] No category found for "${term}", returning term only.`);
    return [term];
  }

  const candidates = JOB_CATEGORIES[category];
  const fuse = new Fuse(candidates, { includeScore: true, threshold: 0.4 });

  // Fuzzy match
  const fuzzyResults = fuse.search(cleanTerm).map((r) => r.item);

  // String similarity
  const simResults = stringSimilarity
    .findBestMatch(cleanTerm, candidates)
    .ratings.filter((r) => r.rating > 0.6)
    .map((r) => r.target);

  // Combine results uniquely
  const allResults = Array.from(new Set([term, ...fuzzyResults, ...simResults]));

  console.log(`[expandTerm] '${term}' (${category}) expanded to:`, allResults);
  return allResults;
}
