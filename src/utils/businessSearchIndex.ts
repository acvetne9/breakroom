import { Business } from '@/types/business';
import { expandTerm } from './smartSearch';
import { EnhancedBusiness } from '@/services/enhancedBusinessSearch';

interface IndexedBusiness extends Business {
  searchableRoles: string[]; // Original + expanded roles
  searchableName: string;
  searchableType: string;
}

class BusinessSearchIndex {
  private businesses: IndexedBusiness[] = [];
  private roleIndex: Map<string, Set<string>> = new Map(); // role -> business IDs
  private nameIndex: Map<string, string> = new Map(); // normalized name -> business ID
  private isBuilt: boolean = false;

  async buildIndex(businesses: Business[]): Promise<void> {
    console.log(`🔍 Building search index for ${businesses.length} businesses...`);
    const startTime = performance.now();

    this.businesses = [];
    this.roleIndex.clear();
    this.nameIndex.clear();

    // Build index with async synonym expansion
    for (const business of businesses) {
      // Normalize searchable fields
      const searchableName = business.name.toLowerCase().trim();
      const searchableType = (business.businessType || '').toLowerCase().trim();
      
      // Expand roles with synonyms (async with API calls)
      const originalRoles = business.roles?.map(r => r.role.toLowerCase().trim()) || [];
      const expandedRoles = new Set<string>();
      
      // Expand all roles in parallel
      const expansionPromises = originalRoles.map(async role => {
        expandedRoles.add(role); // Add original
        const synonyms = await expandTerm(role);
        synonyms.forEach(synonym => {
          expandedRoles.add(synonym.toLowerCase().trim()); // Add synonyms
        });
      });
      
      await Promise.all(expansionPromises);

      const searchableRoles = Array.from(expandedRoles);

      // Create indexed business
      const indexedBusiness: IndexedBusiness = {
        ...business,
        searchableName,
        searchableType,
        searchableRoles
      };

      this.businesses.push(indexedBusiness);

      // Index by name
      this.nameIndex.set(searchableName, business.id);

      // Index by roles (including synonyms)
      searchableRoles.forEach(role => {
        if (!this.roleIndex.has(role)) {
          this.roleIndex.set(role, new Set());
        }
        this.roleIndex.get(role)!.add(business.id);
      });
    }

    this.isBuilt = true;
    const endTime = performance.now();
    console.log(`✅ Search index built in ${Math.round(endTime - startTime)}ms`);
    console.log(`📊 Index stats: ${this.businesses.length} businesses, ${this.roleIndex.size} unique roles (with synonyms)`);
  }

  searchUnified(query: string, limit: number = 50): EnhancedBusiness[] {
    if (!this.isBuilt) {
      console.warn('⚠️ Search index not built yet');
      return [];
    }

    const queryLower = query.toLowerCase().trim();
    if (!queryLower) return [];

    const matchingBusinessIds = new Set<string>();
    const queryTerms = queryLower.split(/\s+/);

    // Search by name (partial match)
    this.businesses.forEach(business => {
      if (business.searchableName.includes(queryLower)) {
        matchingBusinessIds.add(business.id);
      }
    });

    // Search by business type
    this.businesses.forEach(business => {
      if (business.searchableType && business.searchableType.includes(queryLower)) {
        matchingBusinessIds.add(business.id);
      }
    });

    // Search by roles - using already-expanded terms from index
    queryTerms.forEach(term => {
      const normalizedTerm = term.toLowerCase().trim();
      
      // Check role index for exact matches
      if (this.roleIndex.has(normalizedTerm)) {
        this.roleIndex.get(normalizedTerm)!.forEach(id => {
          matchingBusinessIds.add(id);
        });
      }
      
      // Also check for partial role matches
      this.roleIndex.forEach((ids, role) => {
        if (role.includes(normalizedTerm)) {
          ids.forEach(id => matchingBusinessIds.add(id));
        }
      });
    });

    // Convert IDs to businesses and transform to EnhancedBusiness format
    const results = this.businesses
      .filter(b => matchingBusinessIds.has(b.id))
      .map(b => ({
        ...b,
        lat: b.position.lat,
        lng: b.position.lng,
        roles: b.roles?.map(r => ({
          id: r.id || '',
          role: r.role,
          salary: r.salary,
          votesTotal: r.votesTotal || 0,
          userVote: r.userVote
        })) || []
      } as EnhancedBusiness));

    // Limit results
    return results.slice(0, limit);
  }

  getBusinessById(id: string): IndexedBusiness | undefined {
    return this.businesses.find(b => b.id === id);
  }

  getStats() {
    return {
      totalBusinesses: this.businesses.length,
      totalRoles: this.roleIndex.size,
      isBuilt: this.isBuilt
    };
  }
}

// Singleton instance
const searchIndex = new BusinessSearchIndex();

// Export functions
export const buildSearchIndex = async (businesses: Business[]) => {
  await searchIndex.buildIndex(businesses);
};

export const searchFromIndex = (query: string, limit?: number): EnhancedBusiness[] => {
  return searchIndex.searchUnified(query, limit);
};

export const getIndexStats = () => {
  return searchIndex.getStats();
};
