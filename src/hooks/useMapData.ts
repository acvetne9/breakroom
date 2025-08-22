import { useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';

export const useMapData = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  const loadNYCLandData = useCallback(async () => {
    return fetch('/data/nyc_land.geojson')
      .then(async response => {
        if (!response.ok) return null;
        try {
          const data = await response.json();
          console.log('Successfully loaded NYC land data');
          return data;
        } catch (error) {
          console.warn('Failed to parse NYC land JSON:', error);
          return null;
        }
      })
      .catch(error => {
        console.warn('Failed to load NYC land:', error);
        return null;
      });
  }, []);

  const loadAllMapData = useCallback(async () => {
    try {
      setIsProcessing(true);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data loading timeout')), 10000)
      );

      const [mainData, landData] = await Promise.race([
        Promise.all([loadGeoJSONData(), loadNYCLandData()]),
        timeoutPromise
      ]) as [FeatureCollection | null, any];

      return { mainData, landData };
    } catch (error) {
      console.error('Error loading geographic data:', error);
      return { mainData: null, landData: null };
    } finally {
      setIsProcessing(false);
    }
  }, [loadGeoJSONData, loadNYCLandData]);

  return {
    isProcessing,
    setIsProcessing,
    loadAllMapData
  };
};