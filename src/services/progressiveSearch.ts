import { supabase } from '@/integrations/supabase/client';
import type { Business } from '@/types/business';
import { parseSearchFilters, applyBusinessFilters } from './businessFiltering';

// Extended business interface for internal completeness scoring
interface EnhancedBusiness extends Business {
  completenessScore?: number;
}

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
    maxResults: number = 1000,
    zoom: number = 12
  ): Promise<Business[]> {
    
    // Cancel any existing search
    this.abortController?.abort();
    this.abortController = new AbortController();
    
    const parsedFilters = typeof searchFilters === 'string' 
      ? parseSearchFilters(searchFilters) 
      : searchFilters;
      
    if (!parsedFilters) {
      return this.loadBasicBusinesses(initialBounds, onProgress, maxResults, zoom);
    }
    
    console.log('🔍 Starting viewport-based search with filters:', parsedFilters);
    
    // Always search within viewport bounds - no more global searches
    const derivedMaxResults = this.getMaxResultsForZoom(zoom);
    return this.searchInViewport(initialBounds, parsedFilters, onProgress, derivedMaxResults, zoom);
  }
  
  // Fast client-side text filtering for name/type searches
  private async clientSideTextSearch(
    bounds: MapBounds,
    filters: any,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number,
    zoom: number = 12
  ): Promise<Business[]> {
    
    const allBusinesses = await this.loadBasicBusinesses(bounds, 
      (businesses, isComplete) => {
        // Apply client-side filtering and report progress
        const filtered = applyBusinessFilters(businesses, filters);
        onProgress(filtered.slice(0, maxResults), isComplete);
      }, 
      maxResults * 3, // Load more to account for filtering
      zoom
    );
    
    const filtered = applyBusinessFilters(allBusinesses, filters);
    return filtered.slice(0, maxResults);
  }
  
  // Calculate business completeness score (0-100)
  private calculateCompletenessScore(business: any): number {
    let score = 0;
    
    // Basic data (30 points max)
    if (business.name) score += 10;
    if (business.business_type) score += 5;
    if (business.website) score += 5;
    if (business.atmosphere && business.atmosphere.length > 0) score += 5;
    if (business.salary) score += 5;
    
    // Address data (10 points max)
    if (business.address) score += 10;
    
    // Role data (30 points max)
    if (business.business_roles && business.business_roles.length > 0) {
      score += Math.min(business.business_roles.length * 10, 30);
    }
    
    
    return Math.min(score, 100);
  }

  // Spatially distribute businesses to avoid clustering
  private spatiallyDistribute(businesses: EnhancedBusiness[], gridSize: number = 0.001): EnhancedBusiness[] {
    const grid = new Map<string, EnhancedBusiness[]>();
    
    // Group businesses by grid cells
    businesses.forEach(business => {
      const gridLat = Math.floor(business.position.lat / gridSize);
      const gridLng = Math.floor(business.position.lng / gridSize);
      const key = `${gridLat},${gridLng}`;
      
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(business);
    });
    
    // Select best business from each grid cell
    const distributed: EnhancedBusiness[] = [];
    grid.forEach(cellBusinesses => {
      // Sort by completeness score and take the best one
      const sorted = cellBusinesses.sort((a, b) => {
        const scoreA = a.completenessScore || 0;
        const scoreB = b.completenessScore || 0;
        return scoreB - scoreA;
      });
      distributed.push(sorted[0]);
    });
    
    return distributed;
  }

  // Simplified fast business loading
  private async loadBasicBusinesses(
    bounds: MapBounds,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number,
    zoom: number = 12
  ): Promise<Business[]> {
    
    try {
      // Single fast query without joins or complex processing
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, lat, lng, business_type, website, address')
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .limit(maxResults);
      
      if (error) throw error;
      
      const businesses: Business[] = (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        position: { lat: b.lat, lng: b.lng },
        atmosphere: [],
        salary: null,
        businessType: b.business_type,
        website: b.website,
        address: b.address,
        roles: [],
      }));
      
      onProgress(businesses, true);
      console.log(`📍 Fast load: ${businesses.length} businesses loaded`);
      
      return businesses;
      
    } catch (error) {
      console.warn('Fast load failed:', error);
      onProgress([], true);
      return [];
    }
  }

  // Determine minimum completeness score based on zoom level
  private getMinScoreForZoom(zoom: number): number {
    if (zoom <= 10) return 80; // Very zoomed out - only show most complete businesses
    if (zoom <= 12) return 60; // Medium zoom - show well-documented businesses
    if (zoom <= 14) return 40; // Closer zoom - show moderately complete businesses
    if (zoom <= 16) return 20; // Close zoom - show businesses with basic info
    return 0; // Very close - show all businesses
  }

  // Determine how many businesses to load based on zoom level
  private getMaxResultsForZoom(zoom: number): number {
    if (zoom <= 10) return 500;    // Far out - fewer dots but still present
    if (zoom <= 12) return 1200;   // City level
    if (zoom <= 14) return 2500;   // District level
    if (zoom <= 16) return 4000;   // Neighborhood level
    return 6000;                   // Very close - many dots
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
            business_roles (id, role, salary, votes_total)
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
                votesTotal: r.votes_total || 0,
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
  
  // Search within viewport bounds using the RPC function
  private async searchInViewport(
    bounds: MapBounds,
    filters: any,
    onProgress: (businesses: Business[], isComplete: boolean) => void,
    maxResults: number,
    zoom: number
  ): Promise<Business[]> {
    console.log('🗺️ Starting viewport search:', filters, bounds);
    
    try {
      const { data, error } = await supabase.rpc('businesses_in_bbox', {
        west: bounds.west,
        south: bounds.south,
        east: bounds.east,
        north: bounds.north,
        query_limit: maxResults
      });
      
      if (error) throw error;
      if (!data || data.length === 0) {
        onProgress([], true);
        return [];
      }
      
      // Simplified direct conversion without complex processing
      let businesses: Business[] = (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        position: { lat: b.lat, lng: b.lng },
        atmosphere: b.atmosphere || [],
        salary: b.salary,
        businessType: b.business_type,
        website: b.website,
        address: b.address,
        roles: [],
      }));

      // Apply client-side filtering and cap results
      businesses = applyBusinessFilters(businesses, filters).slice(0, maxResults);

      console.log(`🗺️ Fast viewport search: ${data.length} -> ${businesses.length} businesses`);
      onProgress(businesses, true);
      return businesses;
      
    } catch (error) {
      console.warn('Viewport search failed:', error);
      onProgress([], true);
      return [];
    }
  }
  
  // Load roles for businesses that need them (for role/salary filtering)
  private async loadRolesForBusinesses(businesses: Business[]): Promise<Business[]> {
    if (businesses.length === 0) return businesses;
    
    try {
      const businessIds = businesses.map(b => b.id);
      const { data: roles, error } = await supabase
        .from('business_roles')
        .select('business_id, id, role, salary, votes_total')
        .in('business_id', businessIds);
      
      if (error) throw error;
      
      // Map roles back to businesses
      const rolesByBusinessId = (roles || []).reduce((acc: any, role: any) => {
        if (!acc[role.business_id]) acc[role.business_id] = [];
        acc[role.business_id].push({
          id: role.id,
          role: role.role,
          salary: role.salary,
          votesTotal: role.votes_total || 0,
          userVote: null,
        });
        return acc;
      }, {});
      
      return businesses.map(business => ({
        ...business,
        roles: rolesByBusinessId[business.id] || []
      }));
      
    } catch (error) {
      console.warn('Failed to load roles:', error);
      return businesses;
    }
  }

  abort() {
    this.abortController?.abort();
  }
}

// Global instance
export const progressiveSearch = new ProgressiveBusinessSearch();