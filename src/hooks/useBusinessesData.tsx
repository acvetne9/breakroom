
import { useState, useEffect, useCallback } from 'react';
import { Business } from '@/types/business';
import { getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';
import { mapBusinessRow } from '@/utils/businessMapper';
import { NYC_BOUNDS } from '@/utils/geo';
import { supabase } from '@/integrations/supabase/client';
import { useSessionCache } from './useSessionCache';
import { useReconnectionHandler } from './useReconnectionHandler';

type CoordinatesCache = Record<string, { lat: number; lng: number; name: string }>;

export const useBusinessesData = () => {
  // Use reusable cache hook
  const { cachedData: initialCachedCoordinates, saveToCache } = useSessionCache<CoordinatesCache>({
    key: 'businesses_coordinates_cache',
    version: '1.0',
  });

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [coordinatesCache, setCoordinatesCache] = useState<CoordinatesCache>(initialCachedCoordinates || {});

  const fetchBasicBusinesses = useCallback(async () => {
    try {
      console.log('🏢 Starting to fetch businesses (fast query)...');
      setLoading(true);

      // Use simple viewport-based query instead of slow spatial RPC
      // Default to NYC area
      const { data: businessesData, error } = await supabase
        .from('businesses')
        .select('id, name, lat, lng, business_type, atmosphere')
        .gte('lat', NYC_BOUNDS.south)
        .lte('lat', NYC_BOUNDS.north)
        .gte('lng', NYC_BOUNDS.west)
        .lte('lng', NYC_BOUNDS.east)
        .limit(5000);

      if (error) {
        console.error('❌ Error fetching businesses:', error);
        setBusinesses([]);
        return;
      }

      const basicBusinesses: Business[] = (businessesData || []).map(b => mapBusinessRow(b));

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
      saveToCache(newCache);
      setBusinesses(basicBusinesses);
    } catch (error) {
      console.error('❌ Error fetching basic businesses:', error);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, [saveToCache]);

  useEffect(() => {
    fetchBasicBusinesses();
  }, [fetchBasicBusinesses]);

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
        saveToCache(updatedCache);
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

  // Automatically refetch businesses when connection is restored
  useReconnectionHandler({
    onReconnect: fetchBasicBusinesses
  });

  return { businesses, loading, setBusinesses, fetchFullBusinessDetails, refetch: fetchBasicBusinesses };
};
