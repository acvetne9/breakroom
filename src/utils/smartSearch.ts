/**
 * Expands job terms into related words using the DataMuse API
 * Generates gender variants and removes plurality for precision
 * @param job - The job term to expand
 * @param enableLogging - Enable console logging (default: true)
 * @returns Array of normalized related job terms
 */
async function expandTerm(job: string, enableLogging: boolean = true): Promise<string[]> {
  const log = (message: string, data: unknown = null) => {
    if (enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] expandTerm:`, message, data || "");
    }
  };

  // Gender suffixes and patterns to transform
  const genderTransforms = [
    { from: "man", to: ["woman", "person"] },
    { from: "woman", to: ["man", "person"] },
    { from: "boy", to: ["girl"] },
    { from: "girl", to: ["boy"] },
    { from: "ess", to: [""] }, // actress -> actor
    { from: "or", to: ["ress"] }, // actor -> actress
    { from: "er", to: ["ress"] }, // waiter -> waitress
    { from: "male", to: ["female"] },
    { from: "female", to: ["male"] },
  ];

  // Common plural suffixes
  const pluralPatterns = [
    { pattern: /ies$/, replacement: "y" },
    { pattern: /ves$/, replacement: "f" },
    { pattern: /ses$/, replacement: "s" },
    { pattern: /ches$/, replacement: "ch" },
    { pattern: /shes$/, replacement: "sh" },
    { pattern: /xes$/, replacement: "x" },
    { pattern: /zes$/, replacement: "z" },
    { pattern: /s$/, replacement: "" },
  ];

  const singularize = (word: string): string => {
    for (const { pattern, replacement } of pluralPatterns) {
      if (pattern.test(word)) {
        return word.replace(pattern, replacement);
      }
    }
    return word;
  };

  // Generate gender variants of a term
  const generateGenderVariants = (term: string): string[] => {
    const variants = new Set([term]);
    const lowerTerm = term.toLowerCase();

    for (const { from, to } of genderTransforms) {
      // Check if the term contains the gender pattern
      if (lowerTerm.includes(from)) {
        to.forEach((replacement) => {
          // Replace at word boundaries
          const variant = term.replace(new RegExp(`\\b${from}\\b`, "gi"), replacement);
          if (variant !== term) {
            variants.add(variant);
          }

          // Also try replacing within compound words
          const compoundVariant = term.replace(new RegExp(from, "gi"), replacement);
          if (compoundVariant !== term) {
            variants.add(compoundVariant);
          }
        });
      }
    }

    return Array.from(variants);
  };

  // Normalize a term by removing gender markers
  const normalizeGender = (term: string): string => {
    let normalized = term;

    // Remove gendered suffixes
    normalized = normalized.replace(/ess$/i, ""); // actress -> actor
    normalized = normalized.replace(/woman$/i, "person"); // businesswoman -> businessperson
    normalized = normalized.replace(/man$/i, "person"); // businessman -> businessperson
    normalized = normalized.replace(/\bfemale\b/gi, ""); // female engineer -> engineer
    normalized = normalized.replace(/\bmale\b/gi, ""); // male nurse -> nurse
    normalized = normalized.replace(/\bgirl\b/gi, ""); // girl scout -> scout
    normalized = normalized.replace(/\bboy\b/gi, ""); // boy scout -> scout

    // Clean up extra spaces
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
  };

  // Get conceptual synonyms for a term
  const getConceptualSynonyms = async (term: string): Promise<string[]> => {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(term)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return [];

      const data = await response.json();
      return data.slice(0, 5).map((item: { word: string }) => item.word); // Top 5 synonyms
    } catch (error) {
      log("Synonym fetch error", { term, error: (error as Error).message });
      return [];
    }
  };

  try {
    log("Starting term expansion", { job });

    const cleanJob = job.trim();
    if (!cleanJob) {
      log("Error: Empty job term provided");
      throw new Error("Job term cannot be empty");
    }

    // Step 1: Get conceptual synonyms of the original term
    const conceptualSynonyms = await getConceptualSynonyms(cleanJob);
    log("Found conceptual synonyms", { synonyms: conceptualSynonyms });

    // Step 2: Generate all search terms (original + synonyms + gender variants of all)
    const allSearchTerms = new Set([cleanJob, ...conceptualSynonyms]);
    const searchVariants: string[] = [];

    for (const term of allSearchTerms) {
      const genderVariants = generateGenderVariants(term);
      searchVariants.push(...genderVariants);
    }

    const uniqueSearchVariants = Array.from(new Set(searchVariants));
    log("Generated search variants", { count: uniqueSearchVariants.length, variants: uniqueSearchVariants });

    // Fetch results for all variants in parallel
    const fetchPromises = uniqueSearchVariants.map(async (variant) => {
      const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(variant)}`;
      log("Fetching from API", { variant });

      try {
        const response = await fetch(url);

        if (!response.ok) {
          log("API request failed", { variant, status: response.status });
          return [];
        }

        const data = await response.json();
        log("API response received", { variant, resultCount: data.length });

        return data.map((item: { word: string }) => item.word);
      } catch (error) {
        log("Fetch error for variant", { variant, error: (error as Error).message });
        return [];
      }
    });

    const resultsArrays = await Promise.all(fetchPromises);
    const allResults = resultsArrays.flat();

    // Process terms: normalize gender, singularize, and deduplicate
    const processedTerms = allResults
      .map((term: string) => normalizeGender(term))
      .map((term: string) => singularize(term))
      .filter((term: string) => term.length > 0); // Remove empty strings

    // Remove duplicates (case-insensitive)
    const uniqueTerms = Array.from(new Map(processedTerms.map((term: string) => [term.toLowerCase(), term])).values());

    log("Term expansion complete", {
      totalFetched: allResults.length,
      uniqueCount: uniqueTerms.length,
      terms: uniqueTerms,
    });

    return uniqueTerms;
  } catch (error) {
    log("Error occurred", { error: (error as Error).message });
    throw error;
  }
}

// Example usage:
// expandTerm('software engineer')
//   .then(terms => console.log('Related terms:', terms))
//   .catch(err => console.error('Error:', err));

// expandTerm('nurse', false)
//   .then(terms => console.log(terms));
