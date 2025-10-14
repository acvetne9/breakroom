import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import * as turf from '@turf/turf';
import type { Business } from '@/types/business';

export interface DeckGLBusinessLayerProps {
  businesses: Business[];
  selectedBusinessId?: string;
  onBusinessClick?: (business: Business) => void;
  getTooltip?: (info: any) => string;
  map?: any;
  neighborhoodBoundary?: { lat: number; lon: number }[];
  searchActive?: boolean;
}

export interface LandmarkEmojiLayerProps {
  landmarks: { lat: number; lng: number; emoji: string }[];
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

    const turfPoly = turf.polygon([polygonCoords]);

    return businesses.filter((b) => {
      if (!b?.position) return false;
      return turf.booleanPointInPolygon(
        turf.point([b.position.lng, b.position.lat]),
        turfPoly
      );
    });
  } catch (err) {
    console.error('❌ Error filtering businesses by polygon:', err);
    return businesses;
  }
};

/**
 * Scatterplot layer for individual businesses
 */
export const createBusinessScatterplotLayer = ({
  businesses,
  selectedBusinessId,
  onBusinessClick,
  getTooltip,
  neighborhoodBoundary,
  searchActive = false
}: DeckGLBusinessLayerProps) => {
  // Filter businesses inside the polygon
  const filteredBusinesses = filterBusinessesInPolygon(businesses, neighborhoodBoundary);

  console.log(`🎯 Creating scatterplot layer with ${filteredBusinesses.length} businesses inside polygon`);
  
  // Consistent marker size (no change during search)
  const radiusMin = 8;
  const radiusMax = 12;
  const baseRadius = 15;
  
  return new ScatterplotLayer({
    id: 'businesses-scatter',
    data: filteredBusinesses,
    pickable: true,
    parameters: {
      depthTest: false // ensures labels/symbols aren't hidden
    },
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusMinPixels: radiusMin,
    radiusMaxPixels: radiusMax,
    lineWidthMinPixels: 2,
    getPosition: (d: Business) => [d.position.lng, d.position.lat],
    getRadius: (_d: Business) => baseRadius,
    getFillColor: (_d: Business) => searchActive ? [255, 215, 0, 255] : [250, 204, 21, 255], // Brighter gold when searching
    getLineColor: (_d: Business) => [255, 255, 255, 255],
    onClick: onBusinessClick ? (info) => info.object && onBusinessClick(info.object as Business) : undefined,
    updateTriggers: {
      getPosition: filteredBusinesses.length,
      getRadius: [filteredBusinesses.length, searchActive],
      getFillColor: [filteredBusinesses.length, searchActive],
    },
  });
};

/**
 * Emoji layer for landmarks - renders behind business scatterplot
 */
export const createEmojiLandmarkLayer = ({
  landmarks
}: LandmarkEmojiLayerProps) => {
  return new TextLayer({
    id: 'emoji-landmarks',
    data: landmarks,
    pickable: false,
    getPosition: (d: { lat: number; lng: number; emoji: string }) => [d.lng, d.lat],
    getText: (d: { lat: number; lng: number; emoji: string }) => d.emoji,
    getSize: 32,
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    parameters: {
      depthTest: false
    },
    updateTriggers: {
      getPosition: landmarks.length,
      getText: landmarks.length,
    },
  });
};

/**
 * Clustered scatterplot layer
 */
export const createBusinessClusterLayer = (
  data: any[],
  onBusinessClick?: (business: Business) => void,
  map?: any,
  neighborhoodBoundary?: { lat: number; lon: number }[]
) => {
  // Filter businesses strictly inside the polygon
  const filteredData = filterBusinessesInPolygon(data, neighborhoodBoundary);

  return new ScatterplotLayer({
    id: 'businesses-cluster',
    data: filteredData,
    pickable: true,
    parameters: {
      depthTest: false // ensures labels/symbols aren't hidden
    },
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 12,
    lineWidthMinPixels: 2,
    getPosition: (d: any) => [d.position.lng, d.position.lat],
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
      getPosition: filteredData.length,
      getRadius: filteredData.length,
      getFillColor: filteredData.length,
    },
  });
};