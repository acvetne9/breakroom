import { ScatterplotLayer } from '@deck.gl/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Business } from '@/types/business';

export interface DeckGLBusinessLayerProps {
  businesses: Business[];
  selectedBusinessId?: string; // Ignored for coloring per request
  onBusinessClick?: (business: Business) => void;
  getTooltip?: (info: any) => string;
  map?: any; // optional MapLibre map for zooming on clusters
}

export const createBusinessScatterplotLayer = ({
  businesses,
  selectedBusinessId,
  onBusinessClick,
  getTooltip
}: DeckGLBusinessLayerProps) => {
  return new ScatterplotLayer({
    id: 'businesses-scatterplot',
    data: businesses,
    pickable: true,
    opacity: 0.8,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 32,
    lineWidthMinPixels: 2,
    getPosition: (d: Business) => [d.position.lng, d.position.lat],
    getRadius: (_d: Business) => 8, // uniform radius
    getFillColor: (_d: Business) => [250, 204, 21, 255], // uniform color (no discoloring)
    getLineColor: [255, 255, 255, 255], // White stroke
    onClick: onBusinessClick ? (info) => {
      if (info.object) {
        onBusinessClick(info.object as Business);
      }
    } : undefined,
    updateTriggers: {
      getRadius: [businesses.length],
      getFillColor: [businesses.length],
    },
    transitions: {
      getRadius: 200,
      getFillColor: 200,
    }
  });
};

// High-performance clustering layer for dense areas
export const createBusinessClusterLayer = ({
  businesses,
  selectedBusinessId,
  onBusinessClick,
  map,
}: DeckGLBusinessLayerProps) => {
  // Simple clustering by grid
  const clusteredData = clusterBusinesses(businesses, 0.001); // ~100m grid

  return new ScatterplotLayer({
    id: 'businesses-clustered',
    data: clusteredData,
    pickable: true,
    opacity: 0.9,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 10,
    radiusMaxPixels: 40,
    lineWidthMinPixels: 2,
    getPosition: (d: any) => [d.lng, d.lat],
    getRadius: (d: any) => Math.min(Math.max(Math.sqrt(d.count) * 6, 10), 40),
    getFillColor: (_d: any) => [250, 204, 21, 255], // uniform color for clusters too
    getLineColor: [255, 255, 255, 255],
    onClick: (info) => {
      if (info.object) {
        const cluster = info.object as any;
        if (cluster.count === 1) {
          onBusinessClick?.(cluster.businesses[0]);
        } else {
          console.log(`🔎 Cluster clicked with ${cluster.count} businesses. Zooming in...`);
          if (map && map.getZoom) {
            const nextZoom = Math.min((map.getZoom?.() || 12) + 1.5, 18);
            map.easeTo?.({ center: [cluster.lng, cluster.lat], zoom: nextZoom, duration: 500 });
          }
        }
      }
    },
    updateTriggers: {
      getRadius: [businesses.length],
      getFillColor: [businesses.length],
    }
  });
};

// Simple grid-based clustering
function clusterBusinesses(businesses: Business[], gridSize: number = 0.001) {
  const clusters = new Map<string, any>();

  businesses.forEach(business => {
    const gridLat = Math.floor(business.position.lat / gridSize) * gridSize;
    const gridLng = Math.floor(business.position.lng / gridSize) * gridSize;
    const key = `${gridLat},${gridLng}`;

    if (!clusters.has(key)) {
      clusters.set(key, {
        lat: gridLat + gridSize / 2,
        lng: gridLng + gridSize / 2,
        count: 0,
        businesses: []
      });
    }

    const cluster = clusters.get(key)!;
    cluster.count++;
    cluster.businesses.push(business);
    
    // Update centroid for better positioning
    if (cluster.count === 1) {
      cluster.lat = business.position.lat;
      cluster.lng = business.position.lng;
    } else {
      cluster.lat = (cluster.lat * (cluster.count - 1) + business.position.lat) / cluster.count;
      cluster.lng = (cluster.lng * (cluster.count - 1) + business.position.lng) / cluster.count;
    }
  });

  return Array.from(clusters.values());
}

export { clusterBusinesses };