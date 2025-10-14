
import { useState, useEffect } from 'react';
import { Business } from '@/types/business';
import { getBusinessesBasic, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';

// SessionStorage cache for businesses with coordinates
const CACHE_KEY = 'businesses_coordinates_cache';
const CACHE_VERSION_KEY = 'businesses_cache_version';
const CACHE_VERSION = '1.0';

const getCachedBusinesses = (): Record<string, { lat: number; lng: number; name: string }> => {
  try {
    const version = sessionStorage.getItem(CACHE_VERSION_KEY);
    if (version !== CACHE_VERSION) {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);
      return {};
    }
    const cached = sessionStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.warn('Failed to read business cache:', error);
    return {};
  }
};

const saveCachedBusinesses = (cache: Record<string, { lat: number; lng: number; name: string }>) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save business cache:', error);
  }
};

export const useBusinessesData = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [coordinatesCache, setCoordinatesCache] = useState<Record<string, { lat: number; lng: number; name: string }>>(getCachedBusinesses());

  useEffect(() => {
    const fetchBasicBusinesses = async () => {
      try {
        console.log('🏢 Starting to fetch businesses...');
        // Load more businesses with wider coverage
        const basicBusinesses = await getBusinessesBasic(25000);
        console.log(`🏢 Successfully loaded ${basicBusinesses.length} businesses`);
        
        // Cache all business coordinates
        const newCache: Record<string, { lat: number; lng: number; name: string }> = {};
        basicBusinesses.forEach(b => {
          if (b.position?.lat && b.position?.lng) {
            newCache[b.id] = {
              lat: b.position.lat,
              lng: b.position.lng,
              name: b.name
            };
          }
        });
        
        console.log(`💾 Cached coordinates for ${Object.keys(newCache).length} businesses`);
        setCoordinatesCache(newCache);
        saveCachedBusinesses(newCache);
        setBusinesses(basicBusinesses);
      } catch (error) {
        console.error('❌ Error fetching basic businesses:', error);
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBasicBusinesses();
  }, []);

  const fetchFullBusinessDetails = async (businessId: string) => {
    try {
      // Check cache first
      const cachedCoords = coordinatesCache[businessId];
      if (cachedCoords) {
        console.log(`✅ Found business coordinates in cache:`, cachedCoords);
        // Return a minimal business object with cached coordinates
        return {
          id: businessId,
          name: cachedCoords.name,
          position: { lat: cachedCoords.lat, lng: cachedCoords.lng },
          address: '',
          atmosphere: [],
          roles: []
        } as Business;
      }

      console.log(`⏳ Business ${businessId} not in cache, fetching from database...`);
      const fullBusiness = await getFullBusinessDetailsService(businessId);
      if (!fullBusiness) {
        return null;
      }

      // Update cache with new coordinates
      if (fullBusiness.position?.lat && fullBusiness.position?.lng) {
        const updatedCache = {
          ...coordinatesCache,
          [businessId]: {
            lat: fullBusiness.position.lat,
            lng: fullBusiness.position.lng,
            name: fullBusiness.name
          }
        };
        setCoordinatesCache(updatedCache);
        saveCachedBusinesses(updatedCache);
      }

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

  return { businesses, loading, setBusinesses, fetchFullBusinessDetails };
};
