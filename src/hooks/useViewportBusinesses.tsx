import { useState, useEffect, useCallback, useRef } from 'react';
import { Business } from '@/types/business';
import { getBusinessesInViewport, getFullBusinessDetails as getFullBusinessDetailsService } from '@/services/businesses';

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

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 1000) => {
    // Debounce viewport changes to avoid excessive API calls
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = setTimeout(async () => {
      try {
        // Expand bounds slightly to preload nearby businesses
        const expandedBounds = {
          north: bounds.north + (bounds.north - bounds.south) * 0.1,
          south: bounds.south - (bounds.north - bounds.south) * 0.1,
          east: bounds.east + (bounds.east - bounds.west) * 0.1,
          west: bounds.west - (bounds.east - bounds.west) * 0.1
        };

        console.log('📍 Original bounds:', bounds);
        console.log('📍 Expanded bounds:', expandedBounds);

        // Avoid duplicate requests for similar bounds
        if (currentBounds && 
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
        
        // Replace businesses with viewport-specific ones
        setBusinesses(viewportBusinesses);
        setCurrentBounds(expandedBounds);
        
        console.log(`✅ Updated state with ${viewportBusinesses.length} businesses`);
      } catch (error) {
        console.error('❌ Error loading viewport businesses:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce
  }, [currentBounds]);

  const fetchFullBusinessDetails = async (businessId: string) => {
    try {
      const fullBusiness = await getFullBusinessDetailsService(businessId);
      if (!fullBusiness) {
        return null;
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

  const clearBusinesses = useCallback(() => {
    setBusinesses([]);
    setCurrentBounds(null);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
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