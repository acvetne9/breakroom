// src/hooks/useViewportBusinesses.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { searchBusinessesUnified } from '@/services/unifiedSearch';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods';
import { useTileCache } from './useTileCache';
import { useMapWorker } from './useMapWorker';

// Preloading and caching
const inflightRequests = new Map<string, Promise<Business[]>>();

// Cap the accumulated browse-mode set so long panning sessions stay light to render.
// The NYC dataset is far smaller than this, so it only guards pathological cases and
// never drops the current viewport (newest results are kept).
const MAX_ACCUMULATED_BUSINESSES = 40000;

// Concurrent request limiting based on zoom
class RequestQueue {
  private activeRequests = 0;
  private maxConcurrent = 3;

  setMaxConcurrent(zoom: number) {
    if (zoom <= 10) this.maxConcurrent = 1;
    else if (zoom <= 12) this.maxConcurrent = 2;
    else if (zoom <= 14) this.maxConcurrent = 3;
    else this.maxConcurrent = 4;
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

// Persistent details cache - using in-memory Map instead of localStorage
class PersistentDetailsCache {
  private static cache = new Map<string, Business>();
  private static MAX_CACHE_SIZE = 500;

  static get(key: string): Business | null {
    return this.cache.get(key) || null;
  }

  static set(key: string, business: Business): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entries (first 50)
      const keysToRemove = Array.from(this.cache.keys()).slice(0, 50);
      keysToRemove.forEach(k => this.cache.delete(k));
    }
    this.cache.set(key, business);
  }

  static has(key: string): boolean {
    return this.cache.has(key);
  }

  static clear(): void {
    this.cache.clear();
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
  // Tracks the real map zoom (plumbed in via loadBusinessesInViewport) so caching,
  // preloading and concurrency use the actual zoom instead of a fixed default.
  const currentZoomRef = useRef<number>(zoom);

  const { getCachedBusinesses, setCachedBusinesses } = useTileCache();
  const { clusterBusinesses } = useMapWorker();

  const schedulePreload = useCallback((bounds: MapBounds) => {
    if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
    if (searchFilters) return;

    preloadTimeoutRef.current = setTimeout(async () => {
      const latSize = bounds.north - bounds.south;
      const lonSize = bounds.east - bounds.west;

      const adjacentAreas: MapBounds[] = [
        { north: bounds.north + latSize, south: bounds.north, east: bounds.east, west: bounds.west },
        { north: bounds.south, south: bounds.south - latSize, east: bounds.east, west: bounds.west },
        { north: bounds.north, south: bounds.south, east: bounds.east + lonSize, west: bounds.east },
        { north: bounds.north, south: bounds.south, east: bounds.west, west: bounds.west - lonSize }
      ];

      const effZoom = currentZoomRef.current;
      for (const area of adjacentAreas) {
        if (!getCachedBusinesses(area, effZoom)) {
          if (effZoom <= 12 && requestQueue.active > 0) {
            console.log('⏭️ Skipping preload at far zoom');
            continue;
          }

          try {
            const b = await requestQueue.run(() =>
              getBusinessesInViewport(area, 2000, undefined, undefined, effZoom)
            );
            setCachedBusinesses(area, b, effZoom);
            console.log(`🔮 Preloaded ${b.length} businesses`);
          } catch (err) {
            console.warn('Preload failed:', err);
          }
        }
      }
    }, 1000);
  }, [getCachedBusinesses, setCachedBusinesses, searchFilters, zoom]);

  const loadBusinessesInViewport = useCallback(async (
    viewportBounds: MapBounds,
    limit = 8000,
    isMoving = false,
    viewZoom?: number
  ) => {
    if (viewZoom != null) currentZoomRef.current = viewZoom;
    const effZoom = currentZoomRef.current;

    let searchPolygon: MapPoint[] | null = null;

    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      searchPolygon = searchFilters.neighborhoodFilter.boundary;
    }

    // Phase 3: Replace expensive JSON.stringify with shallow comparison
    const prevTerms = lastSearchFilters?.textTerms?.join(',') || '';
    const nextTerms = searchFilters?.textTerms?.join(',') || '';

    const isNewSearch = !searchFilters !== !lastSearchFilters ||
      prevTerms !== nextTerms ||
      searchFilters?.roleFilter !== lastSearchFilters?.roleFilter ||
      searchFilters?.businessTypeFilter !== lastSearchFilters?.businessTypeFilter ||
      searchFilters?.neighborhoodFilter?.name !== lastSearchFilters?.neighborhoodFilter?.name;

    // Clear businesses when search changes (new search OR clearing search)
    if (isNewSearch) {
      console.log('🧹 Clearing businesses for new search state');
      setBusinesses([]);
    }

    // CRITICAL: When searching, only load businesses ONCE (on initial search)
    // Don't load new businesses when scrolling during an active search
    if (searchFilters && !isNewSearch) {
      console.log('🔒 Search active - skipping viewport load to preserve tier filtering');
      return;
    }

    if (loading && !isNewSearch && !isMoving) {
      console.log('⏸️ Skipping duplicate request');
      return;
    }

    setIsSearching(!!searchFilters);
    if (isNewSearch) setLastSearchFilters(searchFilters);

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
      // Browse mode: if this whole viewport is already cached at sufficient detail,
      // serve it instantly and skip the network round-trip entirely.
      if (!searchFilters) {
        const cached = getCachedBusinesses(viewportBounds, effZoom);
        if (cached) {
          const existingIds = new Set(businesses.map(b => b.id));
          const merged = [...businesses, ...cached.filter(b => !existingIds.has(b.id))];
          const capped = merged.length > MAX_ACCUMULATED_BUSINESSES
            ? merged.slice(merged.length - MAX_ACCUMULATED_BUSINESSES)
            : merged;
          console.log(`⚡ Tile cache served ${cached.length} businesses (no fetch); ${capped.length} total`);
          setBusinesses(capped);
          setCurrentBounds(viewportBounds);
          schedulePreload(viewportBounds);
          return;
        }
      }

      setLoading(true);

      requestQueue.setMaxConcurrent(effZoom);

      // FIXED: Use database-wide search when searchFilters are present
      // Use viewport-only search when browsing (no filters)
      const requestPromise = searchFilters
        ? requestQueue.run(() =>
            searchBusinessesUnified(searchFilters, viewportBounds, limit)
          )
        : requestQueue.run(() =>
            getBusinessesInViewport(viewportBounds, limit, undefined, undefined, effZoom)
          );

      inflightRequests.set(requestKey, requestPromise);

      try {
        let viewportBusinesses = await requestPromise;

        console.log('📍 Raw businesses from query:', {
          count: viewportBusinesses.length,
          searchMode: !!searchFilters,
          allNames: viewportBusinesses.map(b => b.name)
        });

        // Apply neighborhood polygon filter if needed
        if (searchPolygon) {
          viewportBusinesses = viewportBusinesses.filter(b =>
            isPointInPolygon({ lat: b.position.lat, lon: b.position.lng }, searchPolygon)
          );
        }

        // REMOVED: Center-out sorting (no longer needed with grid sampling)
        // The SQL function now handles even distribution across viewport

        // Search mode: REPLACE (tier filtering happens in MapLibreMap)
        // Browse mode: ACCUMULATE (collect businesses as you scroll)
        const updatedBusinesses = searchFilters
          ? viewportBusinesses  // SEARCH: Replace with filtered results
          : (() => {
              // BROWSE: Accumulate as you scroll (capped to stay light to render)
              const existingIds = new Set(businesses.map(b => b.id));
              const newBusinesses = viewportBusinesses.filter(b => !existingIds.has(b.id));
              const merged = [...businesses, ...newBusinesses];
              return merged.length > MAX_ACCUMULATED_BUSINESSES
                ? merged.slice(merged.length - MAX_ACCUMULATED_BUSINESSES)
                : merged;
            })();

        console.log(`✅ Loaded ${updatedBusinesses.length} businesses (${viewportBusinesses.length} from query, search mode: ${!!searchFilters})`);
        setBusinesses(updatedBusinesses);

        if (!searchFilters) setCachedBusinesses(viewportBounds, viewportBusinesses, effZoom);
        setCurrentBounds(viewportBounds);
        if (!searchFilters) schedulePreload(viewportBounds);

        return viewportBusinesses;
      } catch (err) {
        console.error('❌ Error loading businesses:', err);
        return [];
      } finally {
        inflightRequests.delete(requestKey);
        setLoading(false);
      }
    }, delay);
  }, [loading, businesses, searchFilters, lastSearchFilters, getCachedBusinesses, setCachedBusinesses, schedulePreload, zoom]);

  // FIXED: Properly memoize fetchFullBusinessDetails with stable dependencies
  const fetchFullBusinessDetails = useCallback(async (businessId: string) => {
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
      console.error('❌ Error fetching business details:', err);
      return null;
    }
  }, []); // No dependencies needed - uses service function and updates state

  const clearBusinesses = useCallback(() => {
    console.log('🧹 Clearing all businesses');
    setBusinesses([]);
    setCurrentBounds(null);
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
    };
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
