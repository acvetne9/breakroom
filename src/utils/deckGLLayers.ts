import { ScatterplotLayer } from '@deck.gl/layers';
import type { Business } from '@/types/business';

export interface DeckGLBusinessLayerProps {
  businesses: Business[];
  selectedBusinessId?: string;
  onBusinessClick?: (business: Business) => void;
  getTooltip?: (info: any) => string;
  map?: any;
}

export const createBusinessScatterplotLayer = ({
  businesses,
  selectedBusinessId,
  onBusinessClick,
  getTooltip
}: DeckGLBusinessLayerProps) => {
  // Use stable ID to prevent layer recreation
  const layerId = 'businesses-scatter';
  
  console.log(`🎯 Creating scatterplot layer with ${businesses.length} clickable businesses`);
  console.log(`🎯 onClick handler provided:`, !!onBusinessClick);
  
  // Log sample business data to debug
  if (businesses.length > 0) {
    console.log(`🎯 Sample business data:`, {
      id: businesses[0].id,
      name: businesses[0].name,
      position: businesses[0].position
    });
  }
  
  new ScatterplotLayer({
    id: layerId,
    data: businesses,
    pickable: true,
    stroked: true,
    filled: true,
    opacity: 1.0,
    radiusMinPixels: 8,
    radiusMaxPixels: 8,
    lineWidthMinPixels: 2,
    getPosition: (d: Business) => {
      if (!d || !d.position) {
        console.warn('⚠️ Invalid business data:', d);
        return [0, 0];
      }
      return [d.position.lng, d.position.lat];
    },
    getRadius: (_d: Business) => 8, // Fixed size for all dots
    getFillColor: (_d: Business) => [250, 204, 21, 255], // Consistent yellow for all
    getLineColor: (_d: Business) => [255, 255, 255, 255], // Consistent white border
    onClick: onBusinessClick ? (info, event) => {
      console.log('🎯 DeckGL click event triggered!', { 
        hasObject: !!info.object, 
        objectName: info.object?.name,
        objectId: info.object?.id,
        pickingInfos: info,
        event: event 
      });
      if (info.object) {
        console.log('🎯 Business clicked:', info.object.name, 'ID:', info.object.id);
        onBusinessClick(info.object as Business);
      } else {
        console.warn('⚠️ Click on invalid business object:', info.object);
      }
    } : undefined,
    // Update triggers - dots will appear/disappear instantly when data changes
    updateTriggers: {
      getPosition: [businesses],
      getRadius: [businesses.length],
      getFillColor: [businesses.length]
    }
  });
};

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
    radiusMinPixels: 10,
    radiusMaxPixels: 15,
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
    }
    // REMOVED: transitions - clusters won't animate between positions
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