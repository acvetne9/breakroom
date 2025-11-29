
import { useState, useEffect } from 'react';
import { Business } from '@/types/business';
import { getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { supabase } from '@/integrations/supabase/client';

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
        console.log('🏢 Starting to fetch businesses (fast query)...');
        
        // Use simple viewport-based query instead of slow spatial RPC
        // Default to NYC area
        const { data: businessesData, error } = await supabase
          .from('businesses')
          .select('id, name, lat, lng, business_type, atmosphere')
          .gte('lat', 40.49)
          .lte('lat', 40.92)
          .gte('lng', -74.26)
          .lte('lng', -73.70)
          .limit(5000);
        
        if (error) {
          console.error('❌ Error fetching businesses:', error);
          setBusinesses([]);
          return;
        }

        const basicBusinesses: Business[] = (businessesData || []).map(b => ({
          id: b.id,
          name: b.name,
          position: { lat: b.lat, lng: b.lng },
          businessType: b.business_type,
          atmosphere: b.atmosphere || [],
          roles: []
        }));
        
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
      console.log(`⏳ Fetching full business details for ${businessId}...`);
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
