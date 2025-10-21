/**
 * Expands job terms into related words using the DataMuse API
 * Treats multi-word phrases as single units and focuses on job-relevant terms
 * @param job - The job term to expand
 * @param enableLogging - Enable console logging (default: true)
 * @returns Array of normalized related job terms
 */
export async function expandTerm(job: string, enableLogging: boolean = true): Promise<string[]> {
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
    { from: "ess", to: [""] }, // actress -> actor
    { from: "or", to: ["ress"] }, // actor -> actress
    { from: "er", to: ["ress"] }, // waiter -> waitress
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

  // Generate gender variants of a term (only for complete phrases)
  const generateGenderVariants = (term: string): string[] => {
    const variants = new Set([term]);
    const lowerTerm = term.toLowerCase();

    for (const { from, to } of genderTransforms) {
      // Only match at word boundaries for complete words
      const wordBoundaryRegex = new RegExp(`\\b${from}\\b`, "i");
      if (wordBoundaryRegex.test(lowerTerm)) {
        to.forEach((replacement) => {
          const variant = term.replace(wordBoundaryRegex, replacement);
          if (variant !== term && variant.trim()) {
            variants.add(variant);
          }
        });
      }
    }

    return Array.from(variants);
  };

  // Normalize a term by removing gender markers
  const normalizeGender = (term: string): string => {
    let normalized = term;

    // Remove gendered suffixes at word boundaries only
    normalized = normalized.replace(/\bwoman\b/gi, "person");
    normalized = normalized.replace(/\bman\b/gi, "person");
    normalized = normalized.replace(/ess$/i, ""); // actress -> actor

    // Clean up extra spaces
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
  };

  // Strict job relevance filter
  const isJobRelevant = (term: string, originalJob: string): boolean => {
    const lower = term.toLowerCase();
    const originalLower = originalJob.toLowerCase();

    // Must be at least 3 characters
    if (lower.length < 3) return false;

    // Exclude pure anatomical/botanical terms
    const excludePatterns = [
      /^(hair|fur|wool|silk|fiber|thread|strand)$/i,
      /tomentum|cilium|trichome|follicle|phyton|meristem|tegmen/i,
      /^(chest|drawer|bureau|cabinet|closet|wardrobe)$/i,
      /^(escape|danger|blur|bull|pig|cop|chicken|detective)$/i,
      /^(office|bureau|department|council|committee|desk|table)$/i,
    ];

    if (excludePatterns.some((p) => p.test(lower))) return false;

    // For hair-related jobs, require hair/salon/style/cut/barber in term
    if (/hair|barber|salon|style/i.test(originalLower)) {
      return /hair|salon|style|cut|barber|stylist|dresser|coiffure|barbershop/i.test(lower);
    }

    // For restaurant jobs, require food service terms
    if (/wait|serv|restaurant|bar|food/i.test(originalLower)) {
      return /wait|serv|bartend|host|steward|barista|somm|caterer|restaurant|bar|dining|cafe|flight/i.test(lower);
    }

    return true;
  };

  try {
    log("Starting term expansion", { job });

    const cleanJob = job.trim();
    if (!cleanJob) {
      log("Error: Empty job term provided");
      throw new Error("Job term cannot be empty");
    }

    // CRITICAL: Use the full phrase as a single unit for API calls
    const searchVariants = generateGenderVariants(cleanJob);
    log("Generated search variants", { variants: searchVariants });

    // Fetch results for all variants in parallel
    const fetchPromises = searchVariants.map(async (variant) => {
      const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(variant)}&max=30`;
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

    log("Raw results before filtering", { count: allResults.length });

    // Process terms: normalize gender, singularize, filter
    const processedTerms = allResults
      .map((term: string) => normalizeGender(term))
      .map((term: string) => singularize(term))
      .filter((term: string) => term.length > 0);

    log("After normalization", { count: processedTerms.length });

    // Filter for job relevance
    const validTerms = processedTerms.filter((term: string) => {
      const isValid = isJobRelevant(term, cleanJob);
      if (!isValid && enableLogging) {
        log("Filtered out", { term });
      }
      return isValid;
    });

    log("After validation", { count: validTerms.length });

    // Remove duplicates (case-insensitive)
    const uniqueTerms = Array.from(new Map(validTerms.map((term: string) => [term.toLowerCase(), term])).values());

    log("Term expansion complete", {
      totalFetched: allResults.length,
      afterValidation: validTerms.length,
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
// expandTerm('hair dresser')
//   .then(terms => console.log('Related terms:', terms))
//   .catch(err => console.error('Error:', err));

// expandTerm('waitress', false)
//   .then(terms => console.log(terms));
