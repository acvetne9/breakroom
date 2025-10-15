import nlp from 'compromise';

// Extend compromise with custom job roles and business types
const jobSynonymsPlugin = {
  words: {
    barista: 'JobRole',
    'coffee maker': 'JobRole',
    'espresso technician': 'JobRole',
    server: 'JobRole',
    waiter: 'JobRole',
    waitress: 'JobRole',
    'food server': 'JobRole',
    waitstaff: 'JobRole',
    bartender: 'JobRole',
    mixologist: 'JobRole',
    chef: 'JobRole',
    cook: 'JobRole',
    'line cook': 'JobRole',
    'head cook': 'JobRole',
    'sous chef': 'JobRole',
    cashier: 'JobRole',
    'front desk': 'JobRole',
    receptionist: 'JobRole',
    manager: 'JobRole',
    supervisor: 'JobRole',
    barback: 'JobRole',
    dishwasher: 'JobRole',
    host: 'JobRole',
    hostess: 'JobRole',
    busser: 'JobRole',
    'bus person': 'JobRole',
    cafe: 'BusinessType',
    'coffee shop': 'BusinessType',
    'coffee house': 'BusinessType',
    restaurant: 'BusinessType',
    diner: 'BusinessType',
    eatery: 'BusinessType',
    bistro: 'BusinessType',
    bar: 'BusinessType',
    pub: 'BusinessType',
    tavern: 'BusinessType',
    bakery: 'BusinessType',
    'bake shop': 'BusinessType',
    patisserie: 'BusinessType',
  }
};

nlp.plugin(jobSynonymsPlugin);

// Curated synonym mappings for better accuracy
const roleSynonymMap: Record<string, string[]> = {
  barista: ['coffee maker', 'espresso technician', 'coffee shop worker', 'cafe worker'],
  server: ['waiter', 'waitress', 'food server', 'waitstaff', 'dining attendant'],
  bartender: ['mixologist', 'bar staff', 'bar tender'],
  chef: ['cook', 'head cook', 'sous chef', 'line cook', 'culinary specialist', 'kitchen manager'],
  cashier: ['checkout', 'front desk', 'register operator'],
  manager: ['supervisor', 'team lead', 'shift leader', 'general manager', 'assistant manager'],
  host: ['hostess', 'greeter', 'front of house'],
  busser: ['bus person', 'dining room attendant', 'table cleaner'],
  dishwasher: ['dish', 'kitchen steward', 'pot washer'],
  barback: ['bar back', 'bar support', 'bar assistant'],
  cook: ['chef', 'line cook', 'prep cook', 'kitchen staff'],
  waiter: ['server', 'waitress', 'food server', 'waitstaff'],
  waitress: ['server', 'waiter', 'food server', 'waitstaff'],
};

const businessTypeSynonymMap: Record<string, string[]> = {
  cafe: ['coffee shop', 'coffee house', 'espresso bar', 'tea room'],
  restaurant: ['diner', 'eatery', 'dining establishment', 'bistro', 'trattoria'],
  bar: ['pub', 'tavern', 'lounge', 'saloon', 'cocktail bar'],
  bakery: ['bake shop', 'patisserie', 'bread shop', 'pastry shop'],
  'fast food': ['quick service', 'qsr', 'fast casual'],
  hotel: ['inn', 'lodge', 'resort', 'motel', 'accommodation'],
  gym: ['fitness center', 'health club', 'workout facility'],
  salon: ['hair salon', 'beauty salon', 'hairdresser', 'beauty parlor'],
  'coffee shop': ['cafe', 'coffee house', 'espresso bar'],
  diner: ['restaurant', 'eatery', 'dining establishment'],
  pub: ['bar', 'tavern', 'lounge'],
};

/**
 * Expand a single search term with synonyms using Compromise NLP + curated maps
 */
export function expandWithSynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const allTerms = new Set<string>([normalized]);
  
  // Try NLP detection first
  const doc = nlp(normalized);
  
  // Add curated synonyms for roles
  if (roleSynonymMap[normalized]) {
    roleSynonymMap[normalized].forEach(syn => allTerms.add(syn));
  }
  
  // Add curated synonyms for business types
  if (businessTypeSynonymMap[normalized]) {
    businessTypeSynonymMap[normalized].forEach(syn => allTerms.add(syn));
  }
  
  // Reverse lookup: if term is a synonym, add the canonical form
  Object.entries(roleSynonymMap).forEach(([canonical, synonyms]) => {
    if (synonyms.includes(normalized)) {
      allTerms.add(canonical);
      // Also add other synonyms of the canonical term
      synonyms.forEach(syn => allTerms.add(syn));
    }
  });
  
  Object.entries(businessTypeSynonymMap).forEach(([canonical, synonyms]) => {
    if (synonyms.includes(normalized)) {
      allTerms.add(canonical);
      synonyms.forEach(syn => allTerms.add(syn));
    }
  });
  
  // Handle plurals/singulars with Compromise
  try {
    const singular = doc.nouns().toSingular().text();
    const plural = doc.nouns().toPlural().text();
    if (singular && singular !== normalized) allTerms.add(singular);
    if (plural && plural !== normalized) allTerms.add(plural);
  } catch (e) {
    // Silent fail for NLP processing errors
  }
  
  return Array.from(allTerms);
}

/**
 * Check if two terms are synonyms
 */
export function areSynonyms(term1: string, term2: string): boolean {
  const t1 = term1.toLowerCase().trim();
  const t2 = term2.toLowerCase().trim();
  
  if (t1 === t2) return true;
  
  const expandedT1 = expandWithSynonyms(t1);
  return expandedT1.includes(t2);
}

/**
 * Expand all terms in a search query
 */
export function expandQueryWithSynonyms(query: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const expandedSet = new Set<string>();
  
  terms.forEach(term => {
    expandWithSynonyms(term).forEach(syn => expandedSet.add(syn));
  });
  
  return Array.from(expandedSet);
}
