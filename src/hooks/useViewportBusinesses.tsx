import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { progressiveSearch } from '@/services/progressiveSearch';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods'
import { useTileCache } from './useTileCache';
import { useMapWorker } from './useMapWorker';

// Preloading and caching
const inflightRequests = new Map<string, Promise<Business[]>>();

// Concurrent request limiting based on zoom
class RequestQueue {
  private activeRequests = 0;
  private maxConcurrent = 3;

  setMaxConcurrent(zoom: number) {
    if (zoom <= 10) this.maxConcurrent = 1; // Far zoom: 1 request at a time
    else if (zoom <= 12) this.maxConcurrent = 2; // Medium zoom: 2 concurrent
    else if (zoom <= 14) this.maxConcurrent = 3; // Close zoom: 3 concurrent
    else this.maxConcurrent = 4; // Very close: 4 concurrent
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
    }
  }

  get active() {
    return this.activeRequests;
  }
}

const requestQueue = new RequestQueue();

// Persistent details cache using localStorage
class PersistentDetailsCache {
  private static CACHE_KEY = 'business_details_cache';
  private static MAX_CACHE_SIZE = 500; // increased limit

  static get(key: string): Business | null {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY);
      if (!cache) return null;
      const parsed = JSON.parse(cache);
      return parsed[key] || null;
    } catch {
      return null;
    }
  }

  static set(key: string, business: Business): void {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY);
      const parsed = cache ? JSON.parse(cache) : {};
      
      // If over limit, remove oldest entries
      const keys = Object.keys(parsed);
      if (keys.length >= this.MAX_CACHE_SIZE) {
        keys.slice(0, keys.length - this.MAX_CACHE_SIZE + 50).forEach(k => delete parsed[k]);
      }
      
      parsed[key] = business;
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.warn('Failed to cache business details:', e);
    }
  }

  static has(key: string): boolean {
    return this.get(key) !== null;
  }

  static clear(): void {
    localStorage.removeItem(this.CACHE_KEY);
  }
}

type MapBounds = { north: number; south: number; east: number; west: number };
type MapPoint = { lat: number; lon: number };

export const useViewportBusinesses = (searchFilters?: any, zoom: number = 12) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastSearchFilters, setLastSearchFilters] = useState<any>(null);

  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { getCachedBusinesses, setCachedBusinesses } = useTileCache();
  const { clusterBusinesses } = useMapWorker();

  // ----------------- Helpers -----------------
  const calculateBoundsFromPoints = (points: MapPoint[], padding = 0.02): MapBounds => {
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    return {
      north: Math.max(...lats) + padding,
      south: Math.min(...lats) - padding,
      east: Math.max(...lons) + padding,
      west: Math.min(...lons) - padding
    };
  };

  const schedulePreload = useCallback((bounds: MapBounds) => {
    if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
    if (searchFilters) return; // skip preloading during filtered search

    preloadTimeoutRef.current = setTimeout(async () => {
      const latSize = bounds.north - bounds.south;
      const lonSize = bounds.east - bounds.west;

      const adjacentAreas: MapBounds[] = [
        { north: bounds.north + latSize, south: bounds.north, east: bounds.east, west: bounds.west }, // North
        { north: bounds.south, south: bounds.south - latSize, east: bounds.east, west: bounds.west }, // South
        { north: bounds.north, south: bounds.south, east: bounds.east + lonSize, west: bounds.east }, // East
        { north: bounds.north, south: bounds.south, east: bounds.west, west: bounds.west - lonSize }  // West
      ];

      for (const area of adjacentAreas) {
        if (!getCachedBusinesses(area)) {
          // Skip preloading at far zooms to prioritize viewport
          if (zoom <= 11 && requestQueue.active > 0) {
            console.log('⏭️ Skipping preload at far zoom - prioritizing viewport');
            continue;
          }
          
          try {
            const b = await requestQueue.run(() => 
              getBusinessesInViewport(area, 2000, undefined, undefined, zoom)
            );
            setCachedBusinesses(area, b);
            console.log(`🔮 Preloaded ${b.length} businesses for adjacent area`);
          } catch (err) {
            console.warn('Preload failed for area:', area, err);
          }
        }
      }
    }, 1000);
  }, [getCachedBusinesses, setCachedBusinesses, searchFilters, zoom]);

  // ----------------- Main Loading -----------------
  const loadBusinessesInViewport = useCallback(async (viewportBounds: MapBounds, limit = 8000, isMoving = false) => {
    let searchPolygon: MapPoint[] | null = null;

    // If neighborhood filter exists, use its polygon
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      searchPolygon = searchFilters.neighborhoodFilter.boundary;
    }

    const isNewSearch = JSON.stringify(searchFilters) !== JSON.stringify(lastSearchFilters);

    // Only block if it's the exact same request (not just any loading)
    if (loading && !isNewSearch && !isMoving) {
      console.log('⏸️ Skipping duplicate request while loading');
      return;
    }

    setIsSearching(!!searchFilters);
    if (isNewSearch) setLastSearchFilters(searchFilters);

    // Generate request key
    const filterKey = searchFilters ? JSON.stringify(searchFilters) : 'no-filter';
    const requestKey = `${viewportBounds.north}-${viewportBounds.south}-${viewportBounds.east}-${viewportBounds.west}-${limit}-${filterKey}`;

    if (inflightRequests.has(requestKey)) {
      try {
        const result = await inflightRequests.get(requestKey)!;
        setBusinesses(result);
        setCurrentBounds(viewportBounds);
        return result;
      } catch (err) {
        console.error('In-flight request failed', err);
      }
    }

    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    const delay = businesses.length ? (isMoving ? 400 : 150) : 0;

    loadTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      
      // Set max concurrent requests based on zoom
      requestQueue.setMaxConcurrent(zoom);
      
      const requestPromise = requestQueue.run(() => 
        getBusinessesInViewport(viewportBounds, limit, searchFilters, undefined, zoom)
      );
      inflightRequests.set(requestKey, requestPromise);

      try {
        let viewportBusinesses = await requestPromise;

        // If a neighborhood polygon exists, only keep businesses inside
        if (searchPolygon) {
          viewportBusinesses = viewportBusinesses.filter(b =>
            isPointInPolygon({ lat: b.position.lat, lon: b.position.lng }, searchPolygon)
          );
        }

        const updatedBusinesses = searchFilters ? viewportBusinesses : (() => {
          const existingIds = new Set(businesses.map(b => b.id));
          const newBusinesses = viewportBusinesses.filter(b => !existingIds.has(b.id));
          return [...businesses, ...newBusinesses];
        })();
        
        console.log('🔄 useViewportBusinesses: updating businesses state to:', updatedBusinesses.length, 'businesses');
        setBusinesses(updatedBusinesses);

        if (!searchFilters) setCachedBusinesses(viewportBounds, viewportBusinesses);
        setCurrentBounds(viewportBounds);
        if (!searchFilters) schedulePreload(viewportBounds);


        return viewportBusinesses;
      } catch (err) {
        console.error('Error loading viewport businesses', err);
        return [];
      } finally {
        inflightRequests.delete(requestKey);
        setLoading(false);
      }
    }, delay);
  }, [loading, businesses, searchFilters, lastSearchFilters, getCachedBusinesses, setCachedBusinesses, schedulePreload, zoom]);

  // ----------------- Full Details -----------------
  const fetchFullBusinessDetails = async (businessId: string) => {
    if (PersistentDetailsCache.has(businessId)) {
      const cached = PersistentDetailsCache.get(businessId)!;
      setBusinesses(prev => prev.map(b => b.id === businessId ? cached : b));
      return cached;
    }

    try {
      const fullBusiness = await getFullBusinessDetailsService(businessId);
      if (!fullBusiness) return null;

      PersistentDetailsCache.set(businessId, fullBusiness);
      setBusinesses(prev => prev.map(b => b.id === businessId ? fullBusiness : b));
      return fullBusiness;
    } catch (err) {
      console.error('Error fetching business details', err);
      return null;
    }
  };

  const clearBusinesses = useCallback(() => {
    console.log('🧹 Clearing all businesses');
    setBusinesses([]);
    setCurrentBounds(null);
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
  }, []);

  // Cleanup on filter changes
  useEffect(() => {
    progressiveSearch.abort();
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
  }, [searchFilters]);

  return {
    businesses,
    loading,
    isSearching,
    loadBusinessesInViewport,
    fetchFullBusinessDetails,
    clearBusinesses,
    clusterBusinesses
  };
};
