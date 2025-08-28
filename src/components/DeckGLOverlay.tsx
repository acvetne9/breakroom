import React, { useMemo } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import type { Business } from '@/types/business';

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
  const overlay = useMemo(() => {
    const deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: []
    });

    // Add to map
    map.addControl(deckOverlay as any);

    return deckOverlay;
  }, [map]);

  // Update layers when data changes
  useMemo(() => {
    if (!overlay) return;

    const shouldCluster = enableClustering && businesses.length > 500;
    
    const layers = shouldCluster 
      ? [createBusinessClusterLayer({
          businesses,
          selectedBusinessId,
          onBusinessClick,
        })]
      : [createBusinessScatterplotLayer({
          businesses,
          selectedBusinessId,
          onBusinessClick,
        })];

    overlay.setProps({
      layers
    });

    console.log(`🎯 Updated deck.gl with ${businesses.length} businesses (clustering: ${shouldCluster})`);
  }, [overlay, businesses, selectedBusinessId, onBusinessClick, enableClustering]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (overlay && map.hasControl(overlay as any)) {
        map.removeControl(overlay as any);
      }
    };
  }, [overlay, map]);

  return null; // This component doesn't render anything directly
};