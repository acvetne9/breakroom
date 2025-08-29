import { useState, useCallback } from 'react';
import type { Map } from 'maplibre-gl';

export const useVectorTileData = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const addVectorTileSources = useCallback(async (map: Map) => {
    try {
      setIsProcessing(true);
      
      // Add vector tile source for businesses
      if (!map.getSource('businesses-tiles')) {
        map.addSource('businesses-tiles', {
          type: 'vector',
          tiles: [
            // Serve tiles from your public directory
            `${window.location.origin}/tiles/{z}/{x}/{y}.pbf`
          ],
          minzoom: 10,
          maxzoom: 16
        });
      }

      // Add NYC land data as vector tiles (if you convert it too)
      if (!map.getSource('nyc-land-tiles')) {
        map.addSource('nyc-land-tiles', {
          type: 'vector',
          tiles: [
            `${window.location.origin}/tiles/land/{z}/{x}/{y}.pbf`
          ],
          minzoom: 8,
          maxzoom: 16
        });
      }

      console.log('✅ Vector tile sources added successfully');
      return true;
    } catch (error) {
      console.error('❌ Error adding vector tile sources:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const addVectorTileLayers = useCallback((map: Map) => {
    try {
      // Add land layer
      if (!map.getLayer('land-fill')) {
        map.addLayer({
          id: 'land-fill',
          type: 'fill',
          source: 'nyc-land-tiles',
          'source-layer': 'land', // Layer name from tippecanoe
          paint: {
            'fill-color': '#F5DEB3', // wheat color
            'fill-opacity': 1
          }
        });
      }

      // Add business points layer
      if (!map.getLayer('businesses-points')) {
        map.addLayer({
          id: 'businesses-points',
          type: 'circle',
          source: 'businesses-tiles',
          'source-layer': 'businesses', // Layer name from tippecanoe
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2,
              16, 8
            ],
            'circle-color': '#FF6B6B',
            'circle-opacity': 0.8,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
          }
        });
      }

      console.log('✅ Vector tile layers added successfully');
      return true;
    } catch (error) {
      console.error('❌ Error adding vector tile layers:', error);
      return false;
    }
  }, []);

  return {
    isProcessing,
    addVectorTileSources,
    addVectorTileLayers
  };
};