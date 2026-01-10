import { Business } from "@/types/business";

/**
 * Strips punctuation and extra whitespace from text for comparison
 */
export function stripPunctuation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[',.\-!?;:()]/g, '') // Remove common punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if a business matches based on roles
 */
export function isRoleMatch(business: Business, originalTerms: string[]): boolean {
  if (!business.roles || business.roles.length === 0) return false;

  const normalizedTerms = originalTerms.map(t => stripPunctuation(t));

  return business.roles.some(role => {
    const normalizedRole = stripPunctuation(role.role || '');
    return normalizedTerms.some(term => normalizedRole.includes(term));
  });
}

/**
 * Check if a business matches based on address
 */
export function isAddressMatch(business: Business, originalTerms: string[]): boolean {
  if (!business.address) return false;

  const normalizedAddress = stripPunctuation(business.address);
  const normalizedTerms = originalTerms.map(t => stripPunctuation(t));

  return normalizedTerms.some(term => normalizedAddress.includes(term));
}

/**
 * Tiered name matching for progressive search specificity
 * Returns the tier level (1-4) that matched, or null if no match
 */
export function getNameMatchTier(
  business: Business,
  originalTerms: string[],
  isNeighborhoodSearch: boolean
): number | null {
  // Skip name matching for neighborhood searches
  if (isNeighborhoodSearch) return null;

  const businessName = stripPunctuation(business.name);
  const normalizedTerms = originalTerms.map(t => stripPunctuation(t));
  const searchQuery = normalizedTerms.join(' ');

  // Tier 1: Exact match OR name starts with search query
  // "Two Hands" matches "Two Hands" and "Two Hands Restaurant"
  if (businessName === searchQuery || businessName.startsWith(searchQuery + ' ')) {
    return 1;
  }

  // Tier 2: Name contains ALL terms (but not in order or not at start)
  const allTermsInName = normalizedTerms.every(term => businessName.includes(term));
  if (allTermsInName) {
    return 2;
  }

  // Tier 3: Name contains ANY term
  const anyTermInName = normalizedTerms.some(term => businessName.includes(term));
  if (anyTermInName) {
    return 3;
  }

  // Tier 4: Check business type
  if (business.businessType) {
    const normalizedType = stripPunctuation(business.businessType);
    const typeMatch = normalizedTerms.some(term => normalizedType.includes(term));
    if (typeMatch) {
      return 4;
    }
  }

  return null;
}

/**
 * Filter businesses for map display using progressive specificity
 * Tier priority: Name matches > Role matches > Neighborhood matches
 */
export function filterMapResults(
  businesses: Business[],
  originalTerms: string[],
  isNeighborhoodSearch: boolean
): Business[] {
  console.log(`🎯 [filterMapResults] Called with originalTerms:`, originalTerms, `isNeighborhood:`, isNeighborhoodSearch, `total businesses:`, businesses.length);

  if (!originalTerms || originalTerms.length === 0) {
    console.log(`🎯 [filterMapResults] No search terms, returning all ${businesses.length} businesses`);
    return businesses;
  }

  // Categorize all businesses
  const categorized = businesses.map(business => {
    const isRole = isRoleMatch(business, originalTerms);
    const isAddress = isAddressMatch(business, originalTerms);
    const nameTier = getNameMatchTier(business, originalTerms, isNeighborhoodSearch);

    return {
      business,
      isRole,
      isAddress,
      nameTier,
      // For neighborhood searches, all businesses are potential neighborhood matches
      isNeighborhoodMatch: isNeighborhoodSearch,
    };
  });

  // Debug: Log first 5 businesses with their tier assignments
  console.log(`🎯 [filterMapResults] First 5 businesses categorized:`, categorized.slice(0, 5).map(item => ({
    name: item.business.name,
    tier: item.nameTier,
    isRole: item.isRole,
  })));

  // Count businesses per tier
  const tier1Count = categorized.filter(item => item.nameTier === 1).length;
  const tier2Count = categorized.filter(item => item.nameTier === 2).length;
  const tier3Count = categorized.filter(item => item.nameTier === 3).length;
  const roleMatchCount = categorized.filter(item => item.isRole && !item.nameTier).length;
  const neighborhoodCount = isNeighborhoodSearch ? businesses.length : 0;

  console.log(`🎯 [filterMapResults] Tier counts: T1=${tier1Count}, T2=${tier2Count}, T3=${tier3Count}, Roles=${roleMatchCount}, Neighborhood=${neighborhoodCount}`);

  // Determine which tier to use
  let selectedTier = 4; // Default: show all

  if (tier1Count > 0) {
    selectedTier = 1;
  } else if (tier2Count > 0) {
    selectedTier = 2;
  } else if (tier3Count > 0) {
    selectedTier = 3;
  } else if (roleMatchCount > 0) {
    // Show role matches if no name matches
    selectedTier = 3;
  } else if (neighborhoodCount > 0) {
    // Show neighborhood matches only if no name or role matches
    selectedTier = 4;
  }

  console.log(`🎯 [filterMapResults] Selected tier: ${selectedTier}`);

  // Filter based on selected tier
  const filtered = categorized.filter(item => {
    // Tier 1-3: Name matches
    if (item.nameTier !== null && item.nameTier <= selectedTier) return true;

    // Always include role matches (unless we have better name matches at tier 1-2)
    if (item.isRole && selectedTier >= 3) return true;

    // Include neighborhood matches only if no name/role matches exist (tier 4)
    if (item.isNeighborhoodMatch && selectedTier === 4) return true;

    return false;
  }).map(item => item.business);

  console.log(`🎯 [filterMapResults] Filtered ${businesses.length} -> ${filtered.length} businesses for map display`);
  console.log(`🎯 [filterMapResults] Kept businesses:`, filtered.slice(0, 10).map(b => b.name));

  return filtered;
}
