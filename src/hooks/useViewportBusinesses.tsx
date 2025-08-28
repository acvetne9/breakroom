import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';

// Aggressive caching system
const businessCache = new Map<string, Business[]>();
const detailsCache = new Map<string, Business>();
const boundsCache = new Map<string, string>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// Cache cleanup
const cacheTimestamps = new Map<string, number>();

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const useViewportBusinesses = () => {
  console.log('🔧 useViewportBusinesses hook initializing');
  
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  console.log('🔧 useViewportBusinesses current state:', { 
    businessCount: businesses.length, 
    loading, 
    hasBounds: !!currentBounds 
  });

  // Cleanup old cache entries
  const cleanupCache = useCallback(() => {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    cacheTimestamps.forEach((timestamp, key) => {
      if (now - timestamp > CACHE_TTL) {
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => {
      businessCache.delete(key);
      detailsCache.delete(key);
      boundsCache.delete(key);
      cacheTimestamps.delete(key);
    });
  }, []);

  // Generate cache key for bounds
  const getBoundsKey = useCallback((bounds: MapBounds, limit: number): string => {
    const precision = 1000; // Round to avoid excessive cache entries
    return `${Math.round(bounds.north * precision)}-${Math.round(bounds.south * precision)}-${Math.round(bounds.east * precision)}-${Math.round(bounds.west * precision)}-${limit}`;
  }, []);

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 1000) => {
    console.log('🎯 loadBusinessesInViewport called with:', { bounds, limit, currentLoading: loading });

    // Cleanup old cache entries periodically
    cleanupCache();
    
    const cacheKey = getBoundsKey(bounds, limit);
    
    // Check cache first (aggressive caching)
    if (businessCache.has(cacheKey)) {
      const cachedBusinesses = businessCache.get(cacheKey)!;
      console.log(`🚀 Cache HIT! Returning ${cachedBusinesses.length} cached businesses`);
      setBusinesses(cachedBusinesses);
      setCurrentBounds(bounds);
      return;
    }

    // Pre-calculate expanded bounds (avoid recreation)
    const expandedBounds = {
      north: bounds.north + (bounds.north - bounds.south) * 0.1,
      south: bounds.south - (bounds.north - bounds.south) * 0.1,
      east: bounds.east + (bounds.east - bounds.west) * 0.1,
      west: bounds.west - (bounds.east - bounds.west) * 0.1
    };

    // Check expanded bounds cache too
    const expandedCacheKey = getBoundsKey(expandedBounds, limit);
    if (businessCache.has(expandedCacheKey)) {
      const cachedBusinesses = businessCache.get(expandedCacheKey)!;
      console.log(`🚀 Expanded cache HIT! Returning ${cachedBusinesses.length} cached businesses`);
      setBusinesses(cachedBusinesses);
      setCurrentBounds(expandedBounds);
      return;
    }

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      console.log('⏹️ Clearing existing timeout');
      clearTimeout(loadTimeoutRef.current);
    }

    // Don't debounce the first load - load immediately if no businesses
    const shouldLoadImmediately = businesses.length === 0;
    const delay = shouldLoadImmediately ? 0 : 300;
    
    console.log(`⏱️ Setting load timeout with ${delay}ms delay (immediate: ${shouldLoadImmediately})`);

    loadTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('📍 Original bounds:', bounds);
        console.log('📍 Expanded bounds:', expandedBounds);

        // Skip duplicate check for first load
        if (!shouldLoadImmediately && currentBounds && 
            Math.abs(currentBounds.north - expandedBounds.north) < 0.005 &&
            Math.abs(currentBounds.south - expandedBounds.south) < 0.005 &&
            Math.abs(currentBounds.east - expandedBounds.east) < 0.005 &&
            Math.abs(currentBounds.west - expandedBounds.west) < 0.005) {
          console.log('🔄 Skipping duplicate request for similar bounds');
          return;
        }

        setLoading(true);
        console.log('🔄 Loading businesses for viewport:', expandedBounds, 'limit:', limit);
        
        const viewportBusinesses = await getBusinessesInViewport(expandedBounds, limit);
        
        console.log(`📊 Received ${viewportBusinesses.length} businesses from service`);
        
        // Aggressive caching with size limits
        if (businessCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = businessCache.keys().next().value;
          businessCache.delete(oldestKey);
          cacheTimestamps.delete(oldestKey);
        }
        
        // Cache the results
        businessCache.set(expandedCacheKey, viewportBusinesses);
        cacheTimestamps.set(expandedCacheKey, Date.now());
        
        // Replace businesses with viewport-specific ones
        setBusinesses(viewportBusinesses);
        setCurrentBounds(expandedBounds);
        
        console.log(`✅ Updated state with ${viewportBusinesses.length} businesses`);
        
      } catch (error) {
        console.error('❌ Error loading viewport businesses:', error);
      } finally {
        setLoading(false);
      }
    }, delay);
  }, [currentBounds, businesses.length, loading, cleanupCache, getBoundsKey]);

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

      // Cache the full business details with size limit
      if (detailsCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = detailsCache.keys().next().value;
        detailsCache.delete(oldestKey);
      }
      detailsCache.set(businessId, fullBusiness);

      // Update the businesses array with full details
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
    // Keep cache but clear current state
    console.log('🧹 Cleared business state but kept cache');
  }, []);

  // Cleanup on unmount  
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  return { 
    businesses, 
    loading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clearBusinesses 
  };
};