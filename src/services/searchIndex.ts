import { supabase } from '@/integrations/supabase/client';

// Background search indexer for future optimization
export class SearchIndexer {
  private static instance: SearchIndexer;
  private indexCache = new Map<string, any>();
  private isIndexing = false;

  static getInstance(): SearchIndexer {
    if (!SearchIndexer.instance) {
      SearchIndexer.instance = new SearchIndexer();
    }
    return SearchIndexer.instance;
  }

  // Create business name/type hash for faster text searches
  async createBusinessTextHash(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      console.log('🔨 Building business text search index...');
      
      // Fetch all businesses in batches
      let offset = 0;
      const batchSize = 1000;
      const textIndex = new Map<string, string[]>();

      while (true) {
        const { data, error } = await supabase
          .from('businesses')
          .select('id, name, business_type')
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        // Create searchable text combinations
        for (const business of data) {
          const searchText = [
            business.name?.toLowerCase(),
            business.business_type?.toLowerCase()
          ].filter(Boolean).join(' ');

          // Create n-grams for partial matching
          const terms = this.createSearchTerms(searchText);
          terms.forEach(term => {
            if (!textIndex.has(term)) {
              textIndex.set(term, []);
            }
            textIndex.get(term)?.push(business.id);
          });
        }

        offset += batchSize;
        console.log(`📋 Indexed ${offset} businesses...`);
      }

      this.indexCache.set('textIndex', textIndex);
      console.log(`✅ Text index created with ${textIndex.size} terms`);
      
    } catch (error) {
      console.error('❌ Error building text index:', error);
    } finally {
      this.isIndexing = false;
    }
  }

  // Create role hash for role-based searches  
  async createRoleHash(): Promise<void> {
    try {
      console.log('🔨 Building role search index...');
      
      const { data, error } = await supabase
        .from('business_roles')
        .select('business_id, role, salary');

      if (error) throw error;

      const roleIndex = new Map<string, string[]>();
      const salaryRanges = new Map<string, string[]>();

      for (const role of data || []) {
        // Index by role
        const normalizedRole = role.role?.toLowerCase();
        if (normalizedRole) {
          if (!roleIndex.has(normalizedRole)) {
            roleIndex.set(normalizedRole, []);
          }
          roleIndex.get(normalizedRole)?.push(role.business_id);
        }

        // Index by salary ranges
        if (role.salary) {
          const salaryNum = this.extractSalaryNumber(role.salary);
          if (salaryNum) {
            const range = this.getSalaryRange(salaryNum);
            if (!salaryRanges.has(range)) {
              salaryRanges.set(range, []);
            }
            salaryRanges.get(range)?.push(role.business_id);
          }
        }
      }

      this.indexCache.set('roleIndex', roleIndex);
      this.indexCache.set('salaryRanges', salaryRanges);
      
      console.log(`✅ Role index: ${roleIndex.size} roles, ${salaryRanges.size} salary ranges`);
      
    } catch (error) {
      console.error('❌ Error building role index:', error);
    }
  }

  // Get business IDs matching search terms (for future use)
  getBusinessIdsForText(searchTerms: string[]): string[] {
    const textIndex = this.indexCache.get('textIndex') as Map<string, string[]>;
    if (!textIndex) return [];

    const matchingIds = new Set<string>();
    
    for (const term of searchTerms) {
      const ids = textIndex.get(term.toLowerCase()) || [];
      ids.forEach(id => matchingIds.add(id));
    }

    return Array.from(matchingIds);
  }

  // Get business IDs for roles (for future use)
  getBusinessIdsForRole(role: string): string[] {
    const roleIndex = this.indexCache.get('roleIndex') as Map<string, string[]>;
    if (!roleIndex) return [];
    
    return roleIndex.get(role.toLowerCase()) || [];
  }

  // Helper: Create search terms with n-grams
  private createSearchTerms(text: string): string[] {
    const terms = new Set<string>();
    const words = text.split(/\s+/).filter(Boolean);
    
    // Add full words
    words.forEach(word => terms.add(word));
    
    // Add 3-grams for partial matching
    for (const word of words) {
      if (word.length >= 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          terms.add(word.substring(i, i + 3));
        }
      }
    }

    return Array.from(terms);
  }

  // Helper: Extract salary number from text
  private extractSalaryNumber(salaryText: string): number | null {
    const match = salaryText.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  // Helper: Get salary range bucket
  private getSalaryRange(salary: number): string {
    if (salary < 15) return 'under-15';
    if (salary < 20) return '15-20';
    if (salary < 25) return '20-25';
    if (salary < 30) return '25-30';
    return 'over-30';
  }
}

// Initialize background indexing
export const searchIndexer = SearchIndexer.getInstance();

// Start indexing in background (non-blocking)
setTimeout(() => {
  searchIndexer.createBusinessTextHash();
  searchIndexer.createRoleHash();
}, 2000);