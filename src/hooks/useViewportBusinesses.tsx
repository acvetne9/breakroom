import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
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

export const useViewportBusinesses = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use tile-based caching and web worker
  const { getCachedBusinesses, setCachedBusinesses } = useTileCache();
  const { clusterBusinesses } = useMapWorker();

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 10000, isMoving: boolean = false) => {
    // Prevent duplicate requests if already loading
    if (loading) return;

    // Check tile cache first
    const cachedBusinesses = getCachedBusinesses(bounds);
    if (cachedBusinesses && cachedBusinesses.length > 200) {
      setBusinesses(cachedBusinesses);
      setCurrentBounds(bounds);
      schedulePreload(bounds);
      return;
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

    // Check expanded cache
    const expandedCached = getCachedBusinesses(expandedBounds);
    if (expandedCached && expandedCached.length > 200) {
      setBusinesses(expandedCached);
      setCurrentBounds(expandedBounds);
      return;
    }

    // Request deduplication
    const requestKey = `${expandedBounds.north}-${expandedBounds.south}-${expandedBounds.east}-${expandedBounds.west}-${limit}`;
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
      const requestPromise = getBusinessesInViewport(expandedBounds, limit);
      inflightRequests.set(requestKey, requestPromise);
      
      try {
        const viewportBusinesses = await requestPromise;
        
        // Cache in tile system
        setCachedBusinesses(expandedBounds, viewportBusinesses);
        
        // Update businesses efficiently
        setBusinesses(viewportBusinesses);
        setCurrentBounds(expandedBounds);
        
        // Schedule preloading
        schedulePreload(expandedBounds);
        
      } catch (error) {
        console.error('❌ Error loading viewport businesses:', error);
      } finally {
        setLoading(false);
        inflightRequests.delete(requestKey);
      }
    }, delay);
  }, [currentBounds, businesses.length, loading, getCachedBusinesses, setCachedBusinesses]);

  // Preload adjacent areas for smooth panning
  const schedulePreload = useCallback((bounds: MapBounds) => {
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }
    
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
    clusterBusinesses // Expose clustering capability
  };
};