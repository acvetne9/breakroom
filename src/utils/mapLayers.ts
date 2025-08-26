import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';

export const addLandLayer = (map: maplibregl.Map, landData: any) => {
  if (!landData) return;
  
  if (map.getSource('nyc-land')) {
    (map.getSource('nyc-land') as maplibregl.GeoJSONSource).setData(landData);
  } else {
    map.addSource('nyc-land', { type: 'geojson', data: landData });
    map.addLayer({
      id: 'nyc-land-layer',
      type: 'fill',
      source: 'nyc-land',
      paint: {
        'fill-color': '#F5F5DC', // Wheat color for land
        'fill-opacity': 1.0
      }
    });
  }
  console.log('Added NYC land layer');
};

export const addParksLayer = (map: maplibregl.Map, parkFeatures: any[]) => {
  if (parkFeatures.length === 0) return;
  
  const parksCollection = { type: 'FeatureCollection' as const, features: parkFeatures };
  
  if (map.getSource('simple-parks')) {
    (map.getSource('simple-parks') as maplibregl.GeoJSONSource).setData(parksCollection as any);
  } else {
    map.addSource('simple-parks', { type: 'geojson', data: parksCollection });
    map.addLayer({
      id: 'parks-simple',
      type: 'fill',
      source: 'simple-parks',
      paint: {
        'fill-color': '#87C17A', // 80% green + 20% wheat
        'fill-opacity': 1.0
      }
    });
  }
};

export const addWaterLayer = (map: maplibregl.Map, waterFeatures: any[]) => {
  if (waterFeatures.length === 0) return;
  
  const waterCollection = { type: 'FeatureCollection' as const, features: waterFeatures };
  
  if (map.getSource('simple-water')) {
    (map.getSource('simple-water') as maplibregl.GeoJSONSource).setData(waterCollection as any);
  } else {
    map.addSource('simple-water', { type: 'geojson', data: waterCollection });
    map.addLayer({
      id: 'water-simple',
      type: 'fill',
      source: 'simple-water',
      paint: {
        'fill-color': '#6CA4E1', // 80% water + 20% wheat
        'fill-opacity': 1.0
      }
    });
  }
};

export const addWaterwaysLayer = (map: maplibregl.Map, waterwayFeatures: any[]) => {
  if (waterwayFeatures.length === 0) return;
  
  const waterwaysCollection = { type: 'FeatureCollection' as const, features: waterwayFeatures };
  
  if (map.getSource('waterways')) {
    (map.getSource('waterways') as maplibregl.GeoJSONSource).setData(waterwaysCollection as any);
  } else {
    map.addSource('waterways', { type: 'geojson', data: waterwaysCollection });
    map.addLayer({
      id: 'waterways-layer',
      type: 'line',
      source: 'waterways',
      paint: {
        'line-color': '#999999',
        'line-width': 1,
        'line-opacity': 0.6
      }
    });
  }
  console.log(`Added ${waterwayFeatures.length} waterway features`);
};

export const addRoadsLayer = (map: maplibregl.Map, roadFeatures: any[]) => {
  if (roadFeatures.length === 0) return;
  
  const roadsCollection = { type: 'FeatureCollection' as const, features: roadFeatures };
  
  if (map.getSource('roads')) {
    (map.getSource('roads') as maplibregl.GeoJSONSource).setData(roadsCollection as any);
  } else {
    map.addSource('roads', { type: 'geojson', data: roadsCollection });
    map.addLayer({
      id: 'roads-layer',
      type: 'line',
      source: 'roads',
      paint: {
        'line-color': '#666666',
        'line-width': 2
      }
    });
  }
  console.log(`Added ${roadFeatures.length} road features`);
};

export const addRoadsLayerChunked = async (map: maplibregl.Map, roadFeatures: any[], isMobile: boolean = false) => {
  if (roadFeatures.length === 0) return;
  
  const chunkSize = isMobile ? 2000 : 10000;
  const delay = isMobile ? 100 : 50;
  
  console.log(`🛣️ Loading ${roadFeatures.length} roads in center-out chunks of ${chunkSize} (mobile: ${isMobile})`);
  
  // Remove existing roads layer if it exists
  if (map.getSource('roads')) {
    if (map.getLayer('roads-layer')) {
      map.removeLayer('roads-layer');
    }
    map.removeSource('roads');
  }
  
  // Add empty source first
  map.addSource('roads', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  
  map.addLayer({
    id: 'roads-layer',
    type: 'line',
    source: 'roads',
    paint: {
      'line-color': '#666666',
      'line-width': 2
    }
  });
  
  // Get map center to sort roads by distance from center
  const center = map.getCenter();
  const mapCenterLng = center.lng;
  const mapCenterLat = center.lat;
  
  // Sort roads by distance from map center (closest first)
  const roadsWithDistance = roadFeatures.map(feature => {
    let distance = Infinity;
    try {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        if (coords && coords.length > 0) {
          // Use midpoint of line for distance calculation
          const midIndex = Math.floor(coords.length / 2);
          const [lng, lat] = coords[midIndex];
          distance = Math.sqrt(Math.pow(lng - mapCenterLng, 2) + Math.pow(lat - mapCenterLat, 2));
        }
      }
    } catch (e) {
      // Keep infinite distance for problematic features
    }
    return { feature, distance };
  });
  
  // Sort by distance (closest first)
  roadsWithDistance.sort((a, b) => a.distance - b.distance);
  const sortedRoads = roadsWithDistance.map(item => item.feature);
  
  // Load roads in chunks from center outward
  const chunks = [];
  for (let i = 0; i < sortedRoads.length; i += chunkSize) {
    chunks.push(sortedRoads.slice(i, i + chunkSize));
  }
  
  let loadedFeatures: any[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    loadedFeatures.push(...chunk);
    
    // Update the map data
    const roadsCollection = { type: 'FeatureCollection' as const, features: loadedFeatures };
    (map.getSource('roads') as maplibregl.GeoJSONSource).setData(roadsCollection);
    
    console.log(`🛣️ Loaded center-out road chunk ${i + 1}/${chunks.length} (${loadedFeatures.length}/${sortedRoads.length} total)`);
    
    // Add delay between chunks to prevent memory spikes
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`✅ All ${sortedRoads.length} road features loaded center-out successfully`);
};

export const ensureLayerOrder = (map: maplibregl.Map) => {
  // Ensure proper layer ordering: roads over water/parks, businesses over roads
  if (map.getLayer('roads-layer')) {
    map.moveLayer('roads-layer');
  }
  if (map.getLayer('businesses-layer')) {
    map.moveLayer('businesses-layer');
  }
};

export const addBusinessesLayer = (
  map: maplibregl.Map,
  businesses: any[],
  selectedBusiness?: any,
  onBusinessClick?: (business: any) => void
) => {
  try {
    // Clean up existing
    if (map.getSource('businesses')) {
      if (map.getLayer('businesses-layer')) {
        map.removeLayer('businesses-layer');
      }
      map.removeSource('businesses');
    }

    const businessFeatures = businesses.map(business => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [business.position.lng, business.position.lat] },
      properties: { id: business.id, name: business.name, businessType: business.businessType || 'unknown' }
    }));

    map.addSource('businesses', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: businessFeatures }
    });

    map.addLayer({
      id: 'businesses-layer',
      type: 'circle',
      source: 'businesses',
      paint: {
        'circle-radius': 8,
        'circle-color': selectedBusiness ? [
          'case',
          ['==', ['get', 'id'], selectedBusiness.id],
          '#EF4444',
          '#FACC15'
        ] : '#FACC15',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF'
      }
    });

    // Event handlers
    if (onBusinessClick) {
      const clickHandler = (e: any) => {
        if (e.features?.[0]) {
          const businessId = e.features[0].properties?.id;
          const business = businesses.find(b => b.id === businessId);
          if (business) {
            map.flyTo({
              center: [business.position.lng, business.position.lat],
              zoom: 16,
              duration: 800,
              essential: true
            });
            onBusinessClick(business);
          }
        }
      };

      map.on('click', 'businesses-layer', clickHandler);
      map.on('mouseenter', 'businesses-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'businesses-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      return () => {
        map.off('click', 'businesses-layer', clickHandler);
      };
    }
  } catch (error) {
    console.error('Error adding businesses:', error);
  }
};