import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import type { Business } from '@/types/business';

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;
let overlayUpdateTimeout: NodeJS.Timeout | null = null;

interface DeckGLOverlayProps {
  map: maplibregl.Map | null;
  businesses: Business[] | any[]; // Can be clustered data from worker
  selectedBusinessId?: string;
  onBusinessClick?: (business: Business) => void;
  enableClustering?: boolean;
  isClusteredData?: boolean; // Indicates if data is pre-clustered
  zoom?: number; // Current zoom level
}

export const DeckGLOverlay: React.FC<DeckGLOverlayProps> = ({
  map,
  businesses,
  selectedBusinessId,
  onBusinessClick,
  enableClustering = true,
  isClusteredData = false,
  zoom = 12
}) => {
  const [overlayReady, setOverlayReady] = useState(false);
  
  // Initialize overlay once - but only when map is available
  const overlay = useMemo(() => {
    if (!map) {
      console.log('🔄 Map not ready yet, skipping overlay initialization');
      return null;
    }
    
    if (overlayInstance) {
      setOverlayReady(true);
      return overlayInstance;
    }

    console.log('🎯 Initializing DeckGL overlay');
    const newOverlay = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    // Add to map safely
    try {
      map.addControl(newOverlay as any);
      overlayInstance = newOverlay;
      setOverlayReady(true);
      console.log('✅ DeckGL overlay added to map');
    } catch (error) {
      console.error('❌ Error adding overlay to map:', error);
      return null;
    }

    return newOverlay;
  }, [map]);

  // Optimized layer creation - removed map dependency to prevent infinite loops
  const layers = useMemo(() => {
    if (!businesses.length) return [];
    
    // Use clustered data if available, otherwise decide based on count and zoom
    if (isClusteredData) {
      console.log(`🎯 Using pre-clustered data: ${businesses.length} items`);
      return [createBusinessClusterLayer(businesses, onBusinessClick, map)];
    }
    
    const shouldCluster = enableClustering && (businesses.length > 5000 || zoom < 11);
    
    console.log(`🎯 Creating ${shouldCluster ? 'clustered' : 'scatter'} layer for ${businesses.length} businesses at zoom ${zoom}`);
    
    if (shouldCluster) {
      return [createBusinessClusterLayer(businesses, onBusinessClick, map)];
    } else {
      return [createBusinessScatterplotLayer({
        businesses: businesses as Business[],
        selectedBusinessId,
        onBusinessClick,
      })];
    }
  }, [businesses, selectedBusinessId, onBusinessClick, enableClustering, isClusteredData, zoom]); // Removed map dependency

  // Smooth layer updates with improved transitions
  useEffect(() => {
    if (!overlay || !overlayReady || !map) return;

    // Clear existing timeout
    if (overlayUpdateTimeout) {
      clearTimeout(overlayUpdateTimeout);
    }

    // Direct update without timeout to prevent loops
    overlay.setProps({ 
      layers
    });
    console.log(`🎯 Updated deck.gl with ${layers.length} layers`);

    return () => {
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
    };
  }, [overlay, overlayReady, layers, map]);

  // Cleanup
  useEffect(() => {
    return () => {
      console.log('🔧 DeckGLOverlay cleanup');
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
    };
  }, []);

  return null;
};