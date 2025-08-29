import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import type { Business } from '@/types/business';

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;
let overlayUpdateTimeout: NodeJS.Timeout | null = null;

interface DeckGLOverlayProps {
  map: maplibregl.Map;
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
  
  // Debug: Log business data being passed to DeckGL
  console.log(`🎯 DECKGL OVERLAY RECEIVED:`, {
    businessCount: businesses.length,
    isClusteredData,
    zoom,
    sampleBusiness: businesses[0] ? {
      id: businesses[0].id,
      name: businesses[0].name || 'Unknown',
      position: businesses[0].position
    } : null
  });
  
  // Initialize overlay once
  const overlay = useMemo(() => {
    if (overlayInstance) {
      setOverlayReady(true);
      return overlayInstance;
    }

    const newOverlay = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    // Add to map
    map.addControl(newOverlay as any);
    overlayInstance = newOverlay;
    setOverlayReady(true);

    return newOverlay;
  }, [map]);

  // Optimized layer creation
  const layers = useMemo(() => {
    if (!businesses.length) return [];
    
    // Use clustered data if available, otherwise decide based on count and zoom
    if (isClusteredData) {
      console.log(`🎯 Using pre-clustered data: ${businesses.length} items`);
      return [createBusinessClusterLayer(businesses, onBusinessClick, map)];
    }
    
    const shouldCluster = enableClustering && (businesses.length > 1000 || zoom < 13);
    
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
  }, [businesses, selectedBusinessId, onBusinessClick, enableClustering, isClusteredData, zoom, map]);

  // Throttled layer updates for smooth panning
  useEffect(() => {
    if (!overlay || !overlayReady) return;

    // Clear existing timeout
    if (overlayUpdateTimeout) {
      clearTimeout(overlayUpdateTimeout);
    }

    overlayUpdateTimeout = setTimeout(() => {
      overlay.setProps({ layers });
      console.log(`🎯 Updated deck.gl with ${layers.length} layers (${businesses.length} businesses)`);
    }, 16); // ~60fps updates

    return () => {
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
    };
  }, [overlay, overlayReady, layers, businesses.length]);

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