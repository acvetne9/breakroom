import nlp from 'compromise';
import { 
  expandWithSynonymsSync,
  expandQueryWithSynonymsSync,
  areSynonymsSync,
  precomputeCommonTerms
} from './synonymService';

// Re-export the synchronous versions for immediate use
export { expandWithSynonymsSync as expandWithSynonyms };
export { expandQueryWithSynonymsSync as expandQueryWithSynonyms };
export { areSynonymsSync as areSynonyms };

// Initialize precomputation on module load (async in background)
precomputeCommonTerms();

/**
 * Legacy: Expand a single search term with synonyms
 * Now uses semantic search + hospitality approach via synonymService
 */
export function expandWithSynonymsLegacy(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const allTerms = new Set<string>([normalized]);
  
  // Get synonyms from new service (sync version)
  const synonyms = expandWithSynonymsSync(term);
  synonyms.forEach(syn => allTerms.add(syn));
  
  // Handle plurals/singulars with Compromise
  try {
    const doc = nlp(normalized);
    const singular = doc.nouns().toSingular().text();
    const plural = doc.nouns().toPlural().text();
    if (singular && singular !== normalized) allTerms.add(singular);
    if (plural && plural !== normalized) allTerms.add(plural);
  } catch (e) {
    // Silent fail for NLP processing errors
  }
  
  return Array.from(allTerms);
}
