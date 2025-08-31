import { ScatterplotLayer } from '@deck.gl/layers';
import type { Business } from '@/types/business';

// Use stable layer IDs to prevent infinite re-renders

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
  // Use stable ID to prevent layer recreation
  const layerId = 'businesses-scatter';
  
  // Let deck.gl handle layer diffing efficiently
  return new ScatterplotLayer({
    id: layerId,
    data: businesses,
    pickable: true,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 24,
    lineWidthMinPixels: 1.5,
    getPosition: (d: Business) => [d.position.lng, d.position.lat],
    getRadius: (_d: Business) => 6, // Smaller for better performance
    getFillColor: [250, 204, 21, 255], // Uniform golden color
    getLineColor: [255, 255, 255, 200], // Semi-transparent white stroke
    onClick: onBusinessClick ? (info) => {
      if (info.object) {
        console.log('🎯 Business clicked:', info.object.name);
        onBusinessClick(info.object as Business);
      }
    } : undefined,
    // Efficient update triggers
    updateTriggers: {
      getPosition: [businesses],
      getRadius: [businesses.length],
      getFillColor: []
    },
    // Smooth transitions for business appearance/disappearance
    transitions: {
      getPosition: {
        duration: 400,
        easing: (t: number) => t * t * (3 - 2 * t) // Smooth step
      },
      getRadius: {
        duration: 300,
        easing: (t: number) => t * t * (3 - 2 * t)
      },
      getFillColor: {
        duration: 250,
        easing: (t: number) => t * t * (3 - 2 * t)
      }
    },
    // Performance optimizations
    dataComparator: (newData: any, oldData: any) => {
      if (!Array.isArray(newData) || !Array.isArray(oldData)) return false;
      if (newData.length !== oldData.length) return false;
      return newData.every((business: any, i: number) => 
        business.id === oldData[i]?.id &&
        business.position?.lat === oldData[i]?.position?.lat &&
        business.position?.lng === oldData[i]?.position?.lng
      );
    }
  });
};

// Modern supercluster-based layer for web worker processed data
export const createBusinessClusterLayer = (data: any[], onBusinessClick?: (business: Business) => void, map?: any) => {
  const layerId = 'businesses-cluster';
  
  return new ScatterplotLayer({
    id: layerId,
    data: data,
    pickable: true,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 50,
    lineWidthMinPixels: 2,
    getPosition: (d: any) => {
      if (d.type === 'cluster') {
        return [d.position.lng, d.position.lat];
      } else {
        return [d.position.lng, d.position.lat];
      }
    },
    getRadius: (d: any) => {
      if (d.type === 'cluster') {
        return Math.min(Math.max(Math.sqrt(d.count) * 4, 12), 50);
      } else {
        return 6;
      }
    },
    getFillColor: (d: any) => {
      if (d.type === 'cluster') {
        // Cluster color with opacity based on count
        const intensity = Math.min(d.count / 20, 1);
        return [250, 204, 21, 200 + intensity * 55];
      } else {
        return [250, 204, 21, 255];
      }
    },
    getLineColor: [255, 255, 255, 255],
    onClick: (info) => {
      if (info.object) {
        const item = info.object as any;
        if (item.type === 'cluster') {
          console.log(`🔎 Cluster clicked with ${item.count} businesses. Zooming in...`);
          if (map && map.getZoom) {
            const nextZoom = Math.min((map.getZoom?.() || 12) + 2, 18);
            map.easeTo?.({ 
              center: [item.position.lng, item.position.lat], 
              zoom: nextZoom, 
              duration: 600 
            });
          }
        } else {
          console.log('🎯 Individual business clicked from cluster:', item.name);
          onBusinessClick?.(item);
        }
      }
    },
    updateTriggers: {
      getPosition: [data],
      getRadius: [data],
      getFillColor: [data]
    },
    transitions: {
      getPosition: { 
        duration: 500,
        easing: (t: number) => t * t * (3 - 2 * t)
      },
      getRadius: { 
        duration: 400,
        easing: (t: number) => t * t * (3 - 2 * t)
      },
      getFillColor: {
        duration: 350,
        easing: (t: number) => t * t * (3 - 2 * t)
      }
    }
  });
};

// Legacy fallback clustering (web worker is preferred)
function fallbackClusterBusinesses(businesses: Business[], gridSize: number = 0.001) {
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
    
    if (cluster.count === 1) {
      cluster.lat = business.position.lat;
      cluster.lng = business.position.lng;
    } else {
      cluster.lat = (cluster.lat * (cluster.count - 1) + business.position.lat) / cluster.count;
      cluster.lng = (cluster.lng * (cluster.count - 1) + business.position.lng) / cluster.count;
    }
  });

  return Array.from(clusters.values()).map(cluster => ({
    type: 'cluster',
    id: `fallback-cluster-${cluster.lat}-${cluster.lng}`,
    position: { lat: cluster.lat, lng: cluster.lng },
    count: cluster.count,
    businesses: cluster.businesses
  }));
}

export { fallbackClusterBusinesses };