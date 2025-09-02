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

export const useViewportBusinesses = (searchFilters?: any) => {
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
            const businesses = await getBusinessesInViewport(area, 2000);
            setCachedBusinesses(area, businesses);
            console.log(`🔮 Preloaded ${businesses.length} businesses for adjacent area`);
          } catch (error) {
            console.warn('Preload failed for area:', area, error);
          }
        }
      }
    }, 1000); // Preload after 1 second of inactivity
  }, [getCachedBusinesses, setCachedBusinesses]);

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 10000, isMoving: boolean = false) => {
    // Prevent duplicate requests if already loading
    if (loading) return;

    // Don't trigger any search logic on initial undefined load
    if (searchFilters === undefined && lastSearchFilters === undefined) {
      // Both are undefined, this is just initial state - proceed with normal loading
    } else {
      // Check if this is a new search (different filters)
      const isNewSearch = JSON.stringify(searchFilters) !== JSON.stringify(lastSearchFilters);
      
      // Global search mode: search filters are present
      if (searchFilters) {
        // Clear businesses and start fresh search if filters changed
        if (isNewSearch) {
          console.log('🌍 New global search detected - clearing all businesses');
          setBusinesses([]);
          setIsSearching(true);
          setLastSearchFilters(searchFilters);
        } else {
          // Same search - keep existing results and don't reload
          console.log('🔄 Same search filters - keeping existing results');
          return;
        }
      
        setLoading(true);
        try {        
          await progressiveSearch.searchBusinesses(
            bounds,
            searchFilters,
            (progressBusinesses, isComplete) => {
              // Update with current progress
              console.log(`🌍 Global search progress: ${progressBusinesses.length} businesses found${isComplete ? ' (search complete)' : ''}`);
              setBusinesses([...progressBusinesses]);
              
              if (isComplete) {
                setLoading(false);
                setIsSearching(false);
                setCurrentBounds(bounds);
                console.log(`✅ Global search completed with ${progressBusinesses.length} total businesses`);
              }
            },
            3000 // Increased limit for global search
          );
        } catch (error) {
          console.error('❌ Global search error:', error);
          setLoading(false);
          setIsSearching(false);
        }
        return;
      }
      
      // No search filters - clear search state and load normally
      if (isNewSearch) {
        setLastSearchFilters(null);
        setIsSearching(false);
      }
    }

    // Check tile cache first (only if no search filters are active)
    if (!searchFilters) {
      const cachedBusinesses = getCachedBusinesses(bounds);
      if (cachedBusinesses && cachedBusinesses.length > 200) {
        setBusinesses(cachedBusinesses);
        setCurrentBounds(bounds);
        schedulePreload(bounds);
        return;
      }
    }

    // Expand bounds for better coverage
    const isInitialLoad = businesses.length === 0;
    const expansionFactor = isInitialLoad ? 0.3 : 0.15;
    
    const expandedBounds = {
      north: bounds.north + (bounds.north - bounds.south) * expansionFactor,
      south: bounds.south - (bounds.north - bounds.south) * expansionFactor,
      east: bounds.east + (bounds.east - bounds.west) * expansionFactor,
      west: bounds.west - (bounds.east - bounds.west) * expansionFactor
    };

    // Check expanded cache (only when no search filters)
    if (!searchFilters) {
      const expandedCached = getCachedBusinesses(expandedBounds);
      if (expandedCached && expandedCached.length > 200) {
        setBusinesses(expandedCached);
        setCurrentBounds(expandedBounds);
        return;
      }
    }

    // Request deduplication
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

    // Clear previous timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Optimized debouncing
    const shouldLoadImmediately = businesses.length === 0;
    const delay = shouldLoadImmediately ? 0 : (isMoving ? 400 : 150);

    loadTimeoutRef.current = setTimeout(async () => {
      // Skip similar viewport requests
      if (!shouldLoadImmediately && currentBounds && 
          Math.abs(currentBounds.north - expandedBounds.north) < 0.001 &&
          Math.abs(currentBounds.south - expandedBounds.south) < 0.001 &&
          Math.abs(currentBounds.east - expandedBounds.east) < 0.001 &&
          Math.abs(currentBounds.west - expandedBounds.west) < 0.001) {
        return;
      }

      setLoading(true);
      
      // Create and cache the request promise
      const requestPromise = getBusinessesInViewport(expandedBounds, limit, searchFilters);
      inflightRequests.set(requestKey, requestPromise);
      
      try {
        const viewportBusinesses = await requestPromise;
        
        // Cache in tile system (only if no search filters)
        if (!searchFilters) {
          setCachedBusinesses(expandedBounds, viewportBusinesses);
        }
        
        if (searchFilters) {
          // Replace businesses entirely when filters are active to remove non-matching dots
          setBusinesses(viewportBusinesses);
        } else {
          // Stable accumulation - maintain existing business positions
          setBusinesses(prev => {
            // Create a map of existing businesses by ID for fast lookup
            const existingMap = new Map(prev.map(b => [b.id, b]));
            
            // Only add truly new businesses
            const newBusinesses = viewportBusinesses.filter(b => !existingMap.has(b.id));
            
            // Return stable array - existing businesses keep their positions
            return [...prev, ...newBusinesses];
          });
        }
        setCurrentBounds(expandedBounds);
        
        // Schedule preloading (only when no filters)
        if (!searchFilters) schedulePreload(expandedBounds);
        
      } catch (error) {
        console.error('❌ Error loading viewport businesses:', error);
      } finally {
        setLoading(false);
        inflightRequests.delete(requestKey);
      }
    }, delay);
  }, [loading, getCachedBusinesses, setCachedBusinesses, searchFilters, lastSearchFilters, isSearching, schedulePreload, progressiveSearch]);

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
      setBusinesses(prev => prev.map(business => 
        business.id === businessId ? cachedBusiness : business
      ));
      
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
      setBusinesses(prev => prev.map(business => 
        business.id === businessId ? fullBusiness : business
      ));

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