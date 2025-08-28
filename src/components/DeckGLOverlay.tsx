import React, { useMemo, useRef } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import type { Business } from '@/types/business';

// Resource pool for overlay instances
let overlayInstance: MapboxOverlay | null = null;

interface DeckGLOverlayProps {
  map: maplibregl.Map;
  businesses: Business[];
  selectedBusinessId?: string;
  onBusinessClick?: (business: Business) => void;
  enableClustering?: boolean;
}

export const DeckGLOverlay: React.FC<DeckGLOverlayProps> = ({
  map,
  businesses,
  selectedBusinessId,
  onBusinessClick,
  enableClustering = true
}) => {
  // Reuse overlay instance to avoid constant creation/destruction
  const overlay = useMemo(() => {
    if (overlayInstance) {
      return overlayInstance;
    }

    overlayInstance = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    // Add to map only once
    map.addControl(overlayInstance as any);

    return overlayInstance;
  }, [map]);

  // Memoized layer creation with aggressive caching
  const layers = useMemo(() => {
    const shouldCluster = enableClustering && businesses.length > 500;
    
    console.log(`🎯 Creating ${shouldCluster ? 'clustered' : 'scatter'} layer for ${businesses.length} businesses`);
    
    return shouldCluster 
      ? [createBusinessClusterLayer({
          businesses,
          selectedBusinessId,
          onBusinessClick,
          map,
        })]
      : [createBusinessScatterplotLayer({
          businesses,
          selectedBusinessId,
          onBusinessClick,
        })];
  }, [businesses, selectedBusinessId, onBusinessClick, enableClustering, map]);

  // Update layers efficiently - only when layers actually change
  useMemo(() => {
    if (!overlay) return;

    overlay.setProps({ layers });

    console.log(`🎯 Updated deck.gl with ${businesses.length} businesses (clustering: ${enableClustering && businesses.length > 500})`);
  }, [overlay, layers, businesses.length, enableClustering]);

  // Cleanup on unmount - but keep overlay for reuse
  React.useEffect(() => {
    return () => {
      // Don't remove overlay here - keep it for reuse
      console.log('🔧 DeckGLOverlay cleanup (keeping overlay for reuse)');
    };
  }, []);

  return null; // This component doesn't render anything directly
};