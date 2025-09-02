import { supabase } from '@/integrations/supabase/client';
import type { Business } from '@/types/business';
import { parseSearchFilters, applyBusinessFilters } from './businessFiltering';

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Progressive search that expands outward from viewport
export class ProgressiveBusinessSearch {
  private abortController?: AbortController;
  
  async searchBusinesses(
    initialBounds: MapBounds, 
    searchFilters: any,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number = 1000
  ): Promise<Business[]> {
    
    // Cancel any existing search
    this.abortController?.abort();
    this.abortController = new AbortController();
    
    const parsedFilters = typeof searchFilters === 'string' 
      ? parseSearchFilters(searchFilters) 
      : searchFilters;
      
    if (!parsedFilters) {
      return this.loadBasicBusinesses(initialBounds, onProgress, maxResults);
    }
    
    console.log('🔍 Starting progressive search with filters:', parsedFilters);
    
    // Strategy 1: Client-side text filtering first (fast)
    if (parsedFilters.textTerms?.length > 0 && !parsedFilters.roleFilter && !parsedFilters.salaryQuery) {
      return this.clientSideTextSearch(initialBounds, parsedFilters, onProgress, maxResults);
    }
    
    // Strategy 2: Progressive role-aware search (slower)
    return this.progressiveRoleSearch(initialBounds, parsedFilters, onProgress, maxResults);
  }
  
  // Fast client-side text filtering for name/type searches
  private async clientSideTextSearch(
    bounds: MapBounds,
    filters: any,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number
  ): Promise<Business[]> {
    
    const allBusinesses = await this.loadBasicBusinesses(bounds, 
      (businesses, isComplete) => {
        // Apply client-side filtering and report progress
        const filtered = applyBusinessFilters(businesses, filters);
        onProgress(filtered.slice(0, maxResults), isComplete);
      }, 
      maxResults * 3 // Load more to account for filtering
    );
    
    const filtered = applyBusinessFilters(allBusinesses, filters);
    return filtered.slice(0, maxResults);
  }
  
  // Load basic business data without roles (fast)
  private async loadBasicBusinesses(
    bounds: MapBounds,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number
  ): Promise<Business[]> {
    
    const rings = this.generateSearchRings(bounds, 3);
    const allBusinesses: Business[] = [];
    
    for (let i = 0; i < rings.length && allBusinesses.length < maxResults; i++) {
      if (this.abortController?.signal.aborted) break;
      
      const ring = rings[i];
      const batchSize = Math.min(500, maxResults - allBusinesses.length);
      
      try {
        const { data, error } = await supabase
          .from('businesses')
          .select('id, name, lat, lng, atmosphere, salary, business_type, website')
          .gte('lat', ring.south)
          .lte('lat', ring.north)
          .gte('lng', ring.west)
          .lte('lng', ring.east)
          .limit(batchSize);
        
        if (error) throw error;
        
        const businesses: Business[] = (data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          position: { lat: b.lat, lng: b.lng },
          atmosphere: b.atmosphere || [],
          salary: b.salary,
          businessType: b.business_type,
          website: b.website,
          roles: [], // Load roles later if needed
        }));
        
        allBusinesses.push(...businesses);
        onProgress([...allBusinesses], i === rings.length - 1);
        
        console.log(`📍 Ring ${i + 1}: +${businesses.length} businesses (total: ${allBusinesses.length})`);
        
      } catch (error) {
        console.warn(`Ring ${i + 1} failed:`, error);
        continue;
      }
    }
    
    return allBusinesses;
  }
  
  // Progressive search with role data (slower, for role/salary filters)
  private async progressiveRoleSearch(
    bounds: MapBounds,
    filters: any,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number
  ): Promise<Business[]> {
    
    const rings = this.generateSearchRings(bounds, 2); // Fewer rings for expensive queries
    const allBusinesses: Business[] = [];
    
    for (let i = 0; i < rings.length && allBusinesses.length < maxResults; i++) {
      if (this.abortController?.signal.aborted) break;
      
      const ring = rings[i];
      const batchSize = Math.min(200, maxResults - allBusinesses.length); // Smaller batches
      
      try {
        const { data, error } = await supabase
          .from('businesses')
          .select(`
            id, name, lat, lng, atmosphere, salary, business_type, website,
            business_roles (id, role, salary, upvotes, downvotes)
          `)
          .gte('lat', ring.south)
          .lte('lat', ring.north)
          .gte('lng', ring.west)
          .lte('lng', ring.east)
          .limit(batchSize);
        
        if (error) throw error;
        
        const businesses: Business[] = (data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          position: { lat: b.lat, lng: b.lng },
          atmosphere: b.atmosphere || [],
          salary: b.salary,
          businessType: b.business_type,
          website: b.website,
          roles: Array.isArray(b.business_roles)
            ? b.business_roles.map((r: any) => ({
                role: r.role,
                salary: r.salary,
                upvotes: r.upvotes || 0,
                downvotes: r.downvotes || 0,
                userVote: null,
              }))
            : [],
        }));
        
        // Apply filters to this batch
        const filtered = applyBusinessFilters(businesses, filters);
        allBusinesses.push(...filtered);
        
        onProgress([...allBusinesses], i === rings.length - 1);
        
        console.log(`💼 Ring ${i + 1}: ${businesses.length} -> ${filtered.length} filtered (total: ${allBusinesses.length})`);
        
      } catch (error) {
        console.warn(`Role search ring ${i + 1} failed:`, error);
        continue;
      }
    }
    
    return allBusinesses;
  }
  
  // Generate concentric search rings expanding from viewport
  private generateSearchRings(initialBounds: MapBounds, numRings: number): MapBounds[] {
    const rings: MapBounds[] = [];
    
    const centerLat = (initialBounds.north + initialBounds.south) / 2;
    const centerLng = (initialBounds.east + initialBounds.west) / 2;
    
    const latRange = initialBounds.north - initialBounds.south;
    const lngRange = initialBounds.east - initialBounds.west;
    
    for (let i = 0; i < numRings; i++) {
      const expansion = i * 0.5; // Each ring is 50% larger
      
      rings.push({
        north: centerLat + (latRange / 2) * (1 + expansion),
        south: centerLat - (latRange / 2) * (1 + expansion),
        east: centerLng + (lngRange / 2) * (1 + expansion),
        west: centerLng - (lngRange / 2) * (1 + expansion),
      });
    }
    
    return rings;
  }
  
  abort() {
    this.abortController?.abort();
  }
}

// Global instance
export const progressiveSearch = new ProgressiveBusinessSearch();