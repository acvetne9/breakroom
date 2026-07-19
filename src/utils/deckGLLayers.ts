import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { polygon, point, booleanPointInPolygon } from '@turf/turf';
import type { Business } from '@/types/business';

export interface DeckGLBusinessLayerProps {
  businesses: Business[];
  selectedBusinessId?: string;
  onBusinessClick?: (business: Business) => void;
  getTooltip?: (info: any) => string;
  map?: any;
  neighborhoodBoundary?: { lat: number; lon: number }[];
  searchActive?: boolean;
  zoom?: number;
  clickedBusinessIds?: Set<string>;
}

export interface LandmarkEmojiLayerProps {
  landmarks: { lat: number; lng: number; emoji: string }[];
  zoom?: number;
}

/**
 * Filters businesses strictly inside a neighborhood polygon
 */
const filterBusinessesInPolygon = (
  businesses: Business[],
  neighborhoodBoundary?: { lat: number; lon: number }[]
): Business[] => {
  if (!neighborhoodBoundary?.length) return businesses;

  try {
    const polygonCoords = neighborhoodBoundary.map((p) => [p.lon, p.lat]);

    // Close polygon if necessary
    if (
      polygonCoords.length > 2 &&
      (polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
        polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1])
    ) {
      polygonCoords.push(polygonCoords[0]);
    }

    const turfPoly = polygon([polygonCoords]);

    return businesses.filter((b) => {
      if (!b || !b?.position) return false;
      return booleanPointInPolygon(
        point([b.position.lng, b.position.lat]),
        turfPoly
      );
    });
  } catch (err) {
    console.error('❌ Error filtering businesses by polygon:', err);
    return businesses;
  }
};

/**
 * SIMPLE FIX: Just use array order for z-index
 * The real issue is Deck.GL culling, not z-ordering
 */
const calculateZIndices = (businesses: Business[]): Map<string, number> => {
  const zIndexMap = new Map<string, number>();
  
  // Simple sequential z-index - first business gets z=1000, last gets z=0
  businesses.forEach((b, index) => {
    const zIndex = 1000 - (index / businesses.length) * 1000;
    zIndexMap.set(b.id, zIndex);
  });

  console.log('🎯 Sequential z-ordering:', {
    businessCount: businesses.length,
    firstZ: 1000,
    lastZ: zIndexMap.get(businesses[businesses.length - 1]?.id)
  });

  return zIndexMap;
};

/**
 * Scatterplot layer for individual businesses - renders with z-ordering from viewport center
 */
export const createBusinessScatterplotLayer = ({
  businesses,
  selectedBusinessId,
  onBusinessClick,
  getTooltip,
  neighborhoodBoundary,
  searchActive = false,
  zoom = 12,
  clickedBusinessIds
}: DeckGLBusinessLayerProps) => {
  // Filter out null/undefined businesses first
  const validBusinesses = businesses.filter(b => b != null);
  const filteredBusinesses = filterBusinessesInPolygon(validBusinesses, neighborhoodBoundary);

  if (filteredBusinesses.length === 0) {
    console.log('⚠️ No businesses to render');
    return null;
  }

  // CRITICAL: Calculate z-indices for center-out rendering
  const zIndexMap = calculateZIndices(filteredBusinesses);

  console.log(`🎯 Creating scatterplot layer with ${filteredBusinesses.length} businesses (z-ordered from center)`);
  
  const radiusMin = zoom < 12 ? 6 : zoom < 14 ? 8 : 10;
  const radiusMax = zoom < 12 ? 10 : zoom < 14 ? 12 : 15;
  
  return new ScatterplotLayer({
    id: 'businesses-scatter',
    data: filteredBusinesses,
    pickable: true,
    
    // CRITICAL: Disable depth testing - it's causing culling issues
    parameters: {
      depthTest: false
    },
    
    // CRITICAL: Use LNGLAT coordinate system for proper viewport rendering
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusMinPixels: radiusMin,
    radiusMaxPixels: radiusMax,
    lineWidthMinPixels: 2,
    
    // CRITICAL: Simple 2D coordinates - no z-index
    getPosition: (d: Business) => [d.position.lng, d.position.lat],
    
    getRadius: (_d: Business) => 15,
    
    getFillColor: (d: Business) =>
      clickedBusinessIds?.has(d.id)
        ? [249, 115, 22, 255] // Orange if clicked this session
        : [250, 204, 21, 255], // Gold otherwise
    
    getLineColor: (_d: Business) => [255, 255, 255, 255], // White border
    
    onClick: onBusinessClick ? (info) => {
      console.log('🖱️ Deck.GL layer clicked:', info);
      if (info.object) {
        console.log('🎯 Business clicked:', (info.object as Business).name);
        onBusinessClick(info.object as Business);
      } else {
        console.log('⚠️ Click registered but no object found');
      }
    } : undefined,
    
    updateTriggers: {
      getPosition: [filteredBusinesses.length],
      getRadius: [zoom],
      radiusMinPixels: [zoom],
      radiusMaxPixels: [zoom],
      getFillColor: [clickedBusinessIds?.size ?? 0]
    },
  });
};

/**
 * Emoji layer for landmarks - renders BEHIND business scatterplot at z=0
 */
export const createEmojiLandmarkLayer = ({
  landmarks,
  zoom = 12
}: LandmarkEmojiLayerProps) => {
  // Filter out null/undefined landmarks for safety
  const validLandmarks = landmarks.filter(l => l != null && l.lat != null && l.lng != null && l.emoji != null);
  
  if (validLandmarks.length === 0) {
    return null;
  }

  const emojiSize = zoom < 12 ? 20 : zoom < 14 ? 24 : 28;
  
  return new TextLayer({
    id: 'emoji-landmarks',
    data: validLandmarks,
    pickable: false,
    
    // CRITICAL: Use LNGLAT coordinate system
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    
    // Simple 2D coordinates
    getPosition: (d: { lat: number; lng: number; emoji: string }) => [d.lng, d.lat],
    
    getText: (d: { lat: number; lng: number; emoji: string }) => d.emoji,
    getSize: emojiSize,
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    
    parameters: {
      depthTest: false
    },
    
    updateTriggers: {
      getPosition: validLandmarks.length,
      getText: validLandmarks.length,
      getSize: [zoom]
    },
  });
};

/**
 * Clustered scatterplot layer with z-ordering
 */
export const createBusinessClusterLayer = (
  data: any[],
  onBusinessClick?: (business: Business) => void,
  map?: any,
  neighborhoodBoundary?: { lat: number; lon: number }[],
  zoom: number = 12
) => {
  // Filter businesses strictly inside the polygon
  const filteredData = filterBusinessesInPolygon(data, neighborhoodBoundary);

  if (filteredData.length === 0) {
    return null;
  }

  // Calculate z-indices for clusters too
  const zIndexMap = calculateZIndices(filteredData);

  return new ScatterplotLayer({
    id: 'businesses-cluster',
    data: filteredData,
    pickable: true,
    
    // Enable depth testing for clusters
    parameters: {
      depthTest: true,
      depthMask: true
    },
    
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 12,
    lineWidthMinPixels: 2,
    
    // Use 3D coordinates with z-ordering
    getPosition: (d: any) => {
      const zIndex = zIndexMap.get(d.id) || 500; // Clusters at mid-level
      return [d.position.lng, d.position.lat, zIndex];
    },
    
    getRadius: (d: any) =>
      d.type === 'cluster'
        ? Math.min(Math.max(Math.sqrt(d.count) * 4, 15), 60)
        : 12,
        
    getFillColor: (d: any) =>
      d.type === 'cluster'
        ? [250, 204, 21, 200 + Math.min(d.count / 20, 1) * 55]
        : [250, 204, 21, 255],
        
    getLineColor: [255, 255, 255, 255],
    
    onClick: (info) => {
      if (!info.object) return;
      const item = info.object as any;
      if (item.type === 'cluster') {
        if (map && map.getZoom) {
          const nextZoom = Math.min((map.getZoom?.() || 12) + 2, 18);
          map.easeTo?.({
            center: [item.position.lng, item.position.lat],
            zoom: nextZoom,
            duration: 600,
          });
        }
      } else {
        onBusinessClick?.(item);
      }
    },
    
    updateTriggers: {
      getPosition: [filteredData.length, filteredData.map(d => d.id).join(',')],
      getRadius: [filteredData.length, zoom],
      getFillColor: [filteredData.length],
    },
  });
};
