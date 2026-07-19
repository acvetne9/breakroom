// src/hooks/useViewportBusinesses.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport } from '@/services/businesses';
import { searchBusinessesUnified } from '@/services/unifiedSearch';
import { fetchAndMergeBusinessDetails } from '@/utils/businessDetailsFetch';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods';
import { useTileCache } from './useTileCache';
import { useMapWorker } from './useMapWorker';
import { getTilesForBounds, getTileBounds, getTileKey, sortTilesCenterOut } from '@/utils/tiles';

// Preloading and caching
const inflightRequests = new Map<string, Promise<Business[]>>();
// Dedupe concurrent fetches of the same tile (keyed by tile + rounded zoom).
const inflightTiles = new Map<string, Promise<Business[]>>();

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
      requestQueue.setMaxConcurrent(effZoom);

      // ---------- SEARCH MODE: one database-wide search, replace results ----------
      if (searchFilters) {
        setLoading(true);
        const requestPromise = requestQueue.run(() =>
          searchBusinessesUnified(searchFilters, viewportBounds, limit)
        );
        inflightRequests.set(requestKey, requestPromise);
        try {
          let results = await requestPromise;
          if (searchPolygon) {
            results = results.filter(b =>
              isPointInPolygon({ lat: b.position.lat, lon: b.position.lng }, searchPolygon)
            );
          }
          console.log(`✅ Search loaded ${results.length} businesses`);
          setBusinesses(results);
          setCurrentBounds(viewportBounds);
          return results;
        } catch (err) {
          console.error('❌ Error loading search results:', err);
          return [];
        } finally {
          inflightRequests.delete(requestKey);
          setLoading(false);
        }
      }

      // ---------- BROWSE MODE: tile-chunked, progressive, center-out ----------
      // Progressive accumulation (dedup + cap). Functional updater so it always
      // merges into the latest set, never a stale closure.
      const mergeTile = (incoming: Business[]) => {
        if (!incoming.length) return;
        setBusinesses(prev => {
          const seen = new Set(prev.map(b => b.id));
          const fresh = incoming.filter(b => !seen.has(b.id));
          if (!fresh.length) return prev;
          const merged = [...prev, ...fresh];
          return merged.length > MAX_ACCUMULATED_BUSINESSES
            ? merged.slice(merged.length - MAX_ACCUMULATED_BUSINESSES)
            : merged;
        });
      };

      const allTiles = getTilesForBounds(viewportBounds);

      // Wide views cover too many z14 tiles to chunk efficiently — fall back to a
      // single viewport fetch (still cached per-tile for later zoom-ins).
      const MAX_CHUNK_TILES = 24;
      if (allTiles.length > MAX_CHUNK_TILES) {
        const cached = getCachedBusinesses(viewportBounds, effZoom);
        if (cached) {
          mergeTile(cached);
          setCurrentBounds(viewportBounds);
          setLoading(false);
          schedulePreload(viewportBounds);
          return;
        }
        setLoading(true);
        try {
          const res = await requestQueue.run(() =>
            getBusinessesInViewport(viewportBounds, limit, undefined, undefined, effZoom)
          );
          setCachedBusinesses(viewportBounds, res, effZoom);
          mergeTile(res);
          setCurrentBounds(viewportBounds);
        } catch (err) {
          console.error('❌ Error loading businesses:', err);
        } finally {
          setLoading(false);
          schedulePreload(viewportBounds);
        }
        return;
      }

      // Zoomed in enough to chunk: cover the viewport with z14 tiles, center-out.
      const tiles = sortTilesCenterOut(allTiles, viewportBounds);

      // Serve cached tiles instantly; collect the misses to fetch.
      const missing = tiles.filter((tile) => {
        const cached = getCachedBusinesses(getTileBounds(tile), effZoom);
        if (cached) {
          mergeTile(cached);
          return false;
        }
        return true;
      });
      setCurrentBounds(viewportBounds);

      if (missing.length === 0) {
        setLoading(false);
        schedulePreload(viewportBounds);
        return;
      }

      // Fetch missing tiles in parallel (center-out order); render each as it lands.
      setLoading(true);
      try {
        await Promise.all(missing.map((tile) => {
          const tileBounds = getTileBounds(tile);
          const inflightKey = `${getTileKey(tile)}-${Math.round(effZoom)}`;
          let p = inflightTiles.get(inflightKey);
          if (!p) {
            p = requestQueue
              .run(() => getBusinessesInViewport(tileBounds, limit, undefined, undefined, effZoom))
              .then((res) => {
                setCachedBusinesses(tileBounds, res, effZoom);
                return res;
              })
              .finally(() => inflightTiles.delete(inflightKey));
            inflightTiles.set(inflightKey, p);
          }
          return p.then(mergeTile).catch((e) => console.warn('Tile fetch failed', e));
        }));
        console.log(`✅ Tile-loaded ${missing.length} missing tiles for viewport`);
      } finally {
        setLoading(false);
        schedulePreload(viewportBounds);
      }
    }, delay);
  }, [loading, businesses, searchFilters, lastSearchFilters, getCachedBusinesses, setCachedBusinesses, schedulePreload, zoom]);

  // FIXED: Properly memoize fetchFullBusinessDetails with stable dependencies
  const fetchFullBusinessDetails = useCallback(async (businessId: string) => {
    return fetchAndMergeBusinessDetails(businessId, setBusinesses, {
      getCached: (id) => PersistentDetailsCache.get(id),
      setCached: (fullBusiness) => PersistentDetailsCache.set(businessId, fullBusiness),
      onError: (err) => console.error('❌ Error fetching business details:', err)
    });
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
