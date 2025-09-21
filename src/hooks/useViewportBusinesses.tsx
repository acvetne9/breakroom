import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { progressiveSearch } from '@/services/progressiveSearch';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods'
import { useTileCache } from './useTileCache';
import { useMapWorker } from './useMapWorker';

// Preloading and caching
const inflightRequests = new Map<string, Promise<Business[]>>();
const detailsCache = new Map<string, Business>();
const MAX_DETAILS_CACHE = 200;

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
          try {
            const b = await getBusinessesInViewport(area, 2000, undefined, undefined, zoom);
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

    // Avoid duplicate identical requests
    if (loading && !isNewSearch) return;

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
      const requestPromise = getBusinessesInViewport(viewportBounds, limit, searchFilters, undefined, zoom);
      inflightRequests.set(requestKey, requestPromise);

      try {
        let viewportBusinesses = await getBusinessesInViewport(viewportBounds, limit, searchFilters, undefined, zoom);

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
    if (detailsCache.has(businessId)) {
      const cached = detailsCache.get(businessId)!;
      setBusinesses(prev => prev.map(b => b.id === businessId ? cached : b));
      return cached;
    }

    try {
      const fullBusiness = await getFullBusinessDetailsService(businessId);
      if (!fullBusiness) return null;

      if (detailsCache.size >= MAX_DETAILS_CACHE) {
        detailsCache.delete(detailsCache.keys().next().value);
      }
      detailsCache.set(businessId, fullBusiness);

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
