import nlp from 'compromise';
import { 
  expandWithSynonyms as expandWithSynonymsService,
  expandQueryWithSynonyms as expandQueryService,
  areSynonyms as areSynonymsService,
  precomputeCommonTerms
} from './synonymService';

// Re-export the enhanced synonym service functions
export { expandWithSynonymsService as expandWithSynonyms };
export { expandQueryService as expandQueryWithSynonyms };
export { areSynonymsService as areSynonyms };

// Initialize precomputation on module load
precomputeCommonTerms();

/**
 * Legacy: Expand a single search term with synonyms
 * Now uses hybrid Moby + hospitality approach via synonymService
 */
export function expandWithSynonymsLegacy(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const allTerms = new Set<string>([normalized]);
  
  // Get synonyms from new service
  const synonyms = expandWithSynonymsService(term);
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
