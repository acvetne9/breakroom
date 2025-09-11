import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { progressiveSearch } from '@/services/progressiveSearch';
import { useTileCache } from './useTileCache';
import { useMapWorker } from './useMapWorker';

// Preloading and request deduplication
const inflightRequests = new Map<string, Promise<Business[]>>();
const detailsCache = new Map<string, Business>();
const MAX_DETAILS_CACHE = 200;

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const useViewportBusinesses = (searchFilters?: any, zoom: number = 12) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastSearchFilters, setLastSearchFilters] = useState<any>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use tile-based caching and web worker
  const { getCachedBusinesses, setCachedBusinesses } = useTileCache();
  const { clusterBusinesses } = useMapWorker();

  // Preload adjacent areas for smooth panning
  const schedulePreload = useCallback((bounds: MapBounds) => {
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }
    // Disable preloading when search filters are active
    if (searchFilters) return;
    preloadTimeoutRef.current = setTimeout(async () => {
      const boundsSize = {
        lat: bounds.north - bounds.south,
        lng: bounds.east - bounds.west
      };
      
      // Preload adjacent areas
      const adjacentAreas = [
        // North
        { 
          north: bounds.north + boundsSize.lat, 
          south: bounds.north, 
          east: bounds.east, 
          west: bounds.west 
        },
        // South  
        { 
          north: bounds.south, 
          south: bounds.south - boundsSize.lat, 
          east: bounds.east, 
          west: bounds.west 
        },
        // East
        { 
          north: bounds.north, 
          south: bounds.south, 
          east: bounds.east + boundsSize.lng, 
          west: bounds.east 
        },
        // West
        { 
          north: bounds.north, 
          south: bounds.south, 
          east: bounds.west, 
          west: bounds.west - boundsSize.lng 
        }
      ];
      
      // Preload areas that aren't cached
      for (const area of adjacentAreas) {
        if (!getCachedBusinesses(area)) {
          try {
            const businesses = await getBusinessesInViewport(area, 2000, undefined, undefined, zoom);
            setCachedBusinesses(area, businesses);
            console.log(`🔮 Preloaded ${Array.isArray(businesses) ? businesses.length : 0} businesses for adjacent area`);
          } catch (error) {
            console.warn('Preload failed for area:', area, error);
          }
        }
      }
    }, 1000); // Preload after 1 second of inactivity
  }, [getCachedBusinesses, setCachedBusinesses]);

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 8000, isMoving: boolean = false) => {
    console.log('🗺️ [loadBusinessesInViewport] Called with bounds:', bounds);
    console.log('🗺️ [loadBusinessesInViewport] searchFilters parameter in hook:', searchFilters);
    console.log('🗺️ [loadBusinessesInViewport] searchFilters detailed state:', { 
      hasFilters: !!searchFilters, 
      isNull: searchFilters === null,
      isUndefined: searchFilters === undefined,
      type: typeof searchFilters,
      content: searchFilters,
      stringified: JSON.stringify(searchFilters)
    });
    
    const isNewSearch = JSON.stringify(searchFilters) !== JSON.stringify(lastSearchFilters);
    
    // Only prevent loading for identical requests, allow new searches to interrupt
    if (loading && !isNewSearch) {
      console.log('🗺️ [loadBusinessesInViewport] Already loading same request, returning early');
      return;
    }

    console.log('🔍 [loadBusinessesInViewport] Search state check:', { 
      isNewSearch, 
      hasCurrentFilters: !!searchFilters, 
      hasLastFilters: !!lastSearchFilters,
      currentFilters: searchFilters,
      lastFilters: lastSearchFilters 
    });
    
    // Handle search filter changes
    if (searchFilters) {
      if (isNewSearch) {
        console.log('🗺️ New search filters - clearing businesses and searching in viewport');
        setBusinesses([]);
        setIsSearching(true);
        setLastSearchFilters(searchFilters);
        
        setLoading(true);
        try {
          const viewportBusinesses = await getBusinessesInViewport(bounds, limit, searchFilters, undefined, zoom);
          setBusinesses(viewportBusinesses);
          setCurrentBounds(bounds);
          console.log(`✅ Viewport search completed with ${Array.isArray(viewportBusinesses) ? viewportBusinesses.length : 0} businesses`);
        } catch (error) {
          console.error('❌ Viewport search error:', error);
        } finally {
          setLoading(false);
          setIsSearching(false);
        }
        return;
      } else {
        // Same search - accumulate results when panning to new areas
        console.log('🔄 Same search filters - checking if we need to search new area');
        
        // Check if we're in a significantly different area (more permissive for searches)
        if (currentBounds) {
          // Calculate overlap percentage - search new areas if less than 70% overlap
          const overlapArea = Math.max(0, 
            Math.min(bounds.north, currentBounds.north) - Math.max(bounds.south, currentBounds.south)
          ) * Math.max(0,
            Math.min(bounds.east, currentBounds.east) - Math.max(bounds.west, currentBounds.west)
          );
          
          const currentArea = (bounds.north - bounds.south) * (bounds.east - bounds.west);
          const overlapRatio = overlapArea / currentArea;
          
          console.log('🔄 Overlap analysis:', { overlapRatio, threshold: 0.7 });
          
          // If there's more than 70% overlap, don't search again
          if (overlapRatio > 0.7) {
            console.log('🔄 Area has high overlap with previous search - keeping existing results');
            return;
          }
        }
        
        // Search new area and add to existing results
        console.log('🗺️ Searching new area and adding to existing results');
        setLoading(true);
        try {
          // Use expanded bounds for better search coverage when scrolling
          const expandedBounds = {
            north: bounds.north + (bounds.north - bounds.south) * 0.2,
            south: bounds.south - (bounds.north - bounds.south) * 0.2,
            east: bounds.east + (bounds.east - bounds.west) * 0.2,
            west: bounds.west - (bounds.east - bounds.west) * 0.2
          };
          const newBusinesses = await getBusinessesInViewport(expandedBounds, limit, searchFilters, undefined, zoom);
          setBusinesses(prev => {
            const existingIds = new Set(Array.isArray(prev) ? prev.map(b => b.id) : []);
            const uniqueNew = Array.isArray(newBusinesses) ? newBusinesses.filter(b => !existingIds.has(b.id)) : [];
            console.log(`📍 Adding ${uniqueNew.length} new businesses to existing ${Array.isArray(prev) ? prev.length : 0}`);
            return [...(Array.isArray(prev) ? prev : []), ...uniqueNew];
          });
          setCurrentBounds(expandedBounds);
        } catch (error) {
          console.error('❌ New area search error:', error);
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    
    // No search filters - only clear search state flag, keep results visible
    if (isNewSearch && lastSearchFilters) {
      console.log('🧹 Search cleared but keeping results visible');
      setLastSearchFilters(null);
      setIsSearching(false);
      // Don't clear businesses - let them persist until explicit clear or new search
    }

    // Rest of the normal viewport loading logic for no-filter case
    // Don't override existing search results with cached data
    if (!searchFilters && !lastSearchFilters) {
      const cachedBusinesses = getCachedBusinesses(bounds);
      if (cachedBusinesses && Array.isArray(cachedBusinesses) && cachedBusinesses.length > 200) {
        setBusinesses(cachedBusinesses);
        setCurrentBounds(bounds);
        schedulePreload(bounds);
        return;
      }
    }

    const isInitialLoad = !Array.isArray(businesses) || businesses.length === 0;
    const expansionFactor = isInitialLoad ? 0.3 : 0.15;
    
    const expandedBounds = {
      north: bounds.north + (bounds.north - bounds.south) * expansionFactor,
      south: bounds.south - (bounds.north - bounds.south) * expansionFactor,
      east: bounds.east + (bounds.east - bounds.west) * expansionFactor,
      west: bounds.west - (bounds.east - bounds.west) * expansionFactor
    };

    if (!searchFilters && !lastSearchFilters) {
      const expandedCached = getCachedBusinesses(expandedBounds);
      if (expandedCached && Array.isArray(expandedCached) && expandedCached.length > 200) {
        setBusinesses(expandedCached);
        setCurrentBounds(expandedBounds);
        return;
      }
    }

    const filterKey = searchFilters ? JSON.stringify(searchFilters) : 'no-filter';
    const requestKey = `${expandedBounds.north}-${expandedBounds.south}-${expandedBounds.east}-${expandedBounds.west}-${limit}-${filterKey}`;
    if (inflightRequests.has(requestKey)) {
      console.log('🔄 Reusing in-flight request');
      try {
        const result = await inflightRequests.get(requestKey)!;
        setBusinesses(result);
        setCurrentBounds(expandedBounds);
        return;
      } catch (error) {
        console.error('In-flight request failed:', error);
      }
    }

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    const shouldLoadImmediately = !Array.isArray(businesses) || businesses.length === 0;
    const delay = shouldLoadImmediately ? 0 : (isMoving ? 400 : 150);

    loadTimeoutRef.current = setTimeout(async () => {
      if (!shouldLoadImmediately && currentBounds && 
          Math.abs(currentBounds.north - expandedBounds.north) < 0.001 &&
          Math.abs(currentBounds.south - expandedBounds.south) < 0.001 &&
          Math.abs(currentBounds.east - expandedBounds.east) < 0.001 &&
          Math.abs(currentBounds.west - expandedBounds.west) < 0.001) {
        return;
      }
      
      setLoading(true);
      
      // If we have a neighborhood filter, ensure we search within the neighborhood bounds
      let searchBounds = expandedBounds;
      if (searchFilters?.neighborhoodFilter) {
        const neighborhood = searchFilters.neighborhoodFilter;
        console.log('🏙️ [loadBusinessesInViewport] Neighborhood filter active, using neighborhood bounds:', neighborhood.name);
        
        // Create bounds that encompass the neighborhood
        const boundary = neighborhood.boundary;
        const lats = boundary.map(p => p.lat);
        const lons = boundary.map(p => p.lon);
        
        searchBounds = {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lons),
          west: Math.min(...lons)
        };
        
        console.log('🏙️ [loadBusinessesInViewport] Using neighborhood bounds:', searchBounds);
      }
      
      const requestPromise = getBusinessesInViewport(searchBounds, limit, searchFilters, undefined, zoom);
      inflightRequests.set(requestKey, requestPromise);
      
      try {
        const viewportBusinesses = await requestPromise;
        
        if (!searchFilters) {
          setCachedBusinesses(expandedBounds, viewportBusinesses);
        }
        
        if (searchFilters) {
          setBusinesses(viewportBusinesses);
        } else {
          setBusinesses(prev => {
            const existingMap = new Map(Array.isArray(prev) ? prev.map(b => [b.id, b]) : []);
            const newBusinesses = Array.isArray(viewportBusinesses) ? viewportBusinesses.filter(b => !existingMap.has(b.id)) : [];
            return [...(Array.isArray(prev) ? prev : []), ...newBusinesses];
          });
        }
        setCurrentBounds(expandedBounds);
        
        if (!searchFilters) schedulePreload(expandedBounds);
        
      } catch (error) {
        console.error('❌ Error loading viewport businesses:', error);
      } finally {
        setLoading(false);
        inflightRequests.delete(requestKey);
      }
    }, delay);
  }, [loading, getCachedBusinesses, setCachedBusinesses, searchFilters, lastSearchFilters, isSearching, schedulePreload, currentBounds, Array.isArray(businesses) ? businesses.length : 0, zoom]);

  // Cleanup progressive search and pending timeouts on filter changes
  useEffect(() => {
    progressiveSearch.abort();
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }
  }, [searchFilters]);

  
  // Remove the duplicate schedulePreload definition since it's now defined above

  const fetchFullBusinessDetails = async (businessId: string) => {
    // Check cache first
    if (detailsCache.has(businessId)) {
      console.log(`🚀 Business details cache HIT for ${businessId}`);
      const cachedBusiness = detailsCache.get(businessId)!;
      
      // Update businesses array with cached details
      setBusinesses(prev => Array.isArray(prev) ? prev.map(business => 
        business.id === businessId ? cachedBusiness : business
      ) : [cachedBusiness]);
      
      return cachedBusiness;
    }

    try {
      const fullBusiness = await getFullBusinessDetailsService(businessId);
      if (!fullBusiness) {
        return null;
      }

      // Cache with size limit
      if (detailsCache.size >= MAX_DETAILS_CACHE) {
        const oldestKey = detailsCache.keys().next().value;
        detailsCache.delete(oldestKey);
      }
      detailsCache.set(businessId, fullBusiness);

      // Update businesses array
      setBusinesses(prev => Array.isArray(prev) ? prev.map(business => 
        business.id === businessId ? fullBusiness : business
      ) : [fullBusiness]);

      return fullBusiness;
    } catch (error) {
      console.error('Error fetching full business details:', error);
      return null;
    }
  };

  const clearBusinesses = useCallback(() => {
    setBusinesses([]);
    setCurrentBounds(null);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }
    console.log('🧹 Cleared business state but kept cache');
  }, []);

  // Cleanup on unmount  
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);

  return { 
    businesses, 
    loading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clearBusinesses,
    clusterBusinesses, // Expose clustering capability
    isSearching // Expose search state
  };
};