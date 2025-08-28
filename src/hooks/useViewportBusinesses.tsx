import { useState, useEffect, useCallback } from 'react';
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

  const loadBusinessesInViewport = useCallback(async (bounds: MapBounds, limit: number = 500) => {
    // Avoid duplicate requests for same bounds
    if (currentBounds && 
        Math.abs(currentBounds.north - bounds.north) < 0.001 &&
        Math.abs(currentBounds.south - bounds.south) < 0.001 &&
        Math.abs(currentBounds.east - bounds.east) < 0.001 &&
        Math.abs(currentBounds.west - bounds.west) < 0.001) {
      return;
    }

    setLoading(true);
    try {
      console.log('🔄 Loading businesses for viewport:', bounds);
      const viewportBusinesses = await getBusinessesInViewport(bounds, limit);
      
      // Merge with existing businesses to avoid duplicates
      setBusinesses(prev => {
        const existingIds = new Set(prev.map(b => b.id));
        const newBusinesses = viewportBusinesses.filter(b => !existingIds.has(b.id));
        return [...prev, ...newBusinesses];
      });
      
      setCurrentBounds(bounds);
      console.log(`✅ Loaded ${viewportBusinesses.length} businesses in viewport`);
    } catch (error) {
      console.error('❌ Error loading viewport businesses:', error);
    } finally {
      setLoading(false);
    }
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
  }, []);

  return { 
    businesses, 
    loading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clearBusinesses 
  };
};