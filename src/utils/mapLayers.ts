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

export const addParksAndCemeteriesLayer = (
  map: maplibregl.Map,
  parkFeatures: any[],
  cemeteryFeatures: any[]
) => {
  const greenFeatures = [...parkFeatures, ...cemeteryFeatures];
  if (greenFeatures.length === 0) return;

  const greenCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: greenFeatures
  };

  if (map.getSource('parks-simple')) {
    (map.getSource('parks-simple') as maplibregl.GeoJSONSource).setData(greenCollection);
  } else {
    map.addSource('parks-simple', { type: 'geojson', data: greenCollection });
    map.addLayer({
      id: 'parks-simple',
      type: 'fill',
      source: 'parks-simple',
      paint: {
        'fill-color': '#87C17A', // green for parks + cemeteries
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
        'line-width': [
          'interpolate', 
          ['linear'], 
          ['zoom'],
          10, 1,
          14, 2,
          16, 3,
          18, 4
        ]
      }
    });

    // Add road labels that follow the road geometry
    map.addLayer({
      id: 'roads-labels',
      type: 'symbol',
      source: 'roads',
      layout: {
        'text-field': [
          'case',
          ['has', 'name'],
          ['get', 'name'],
          '' // Empty string if no name
        ],
        'text-font': ['Open Sans Regular'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 10,
          14, 12,
          16, 14,
          18, 16
        ],
        'symbol-placement': 'line', // This makes text follow the road
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
        'text-max-angle': 30, // Maximum angle between adjacent characters
        'text-padding': 10,
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#2D3748', // Dark gray text
        'text-halo-color': 'rgba(255, 255, 255, 0.8)', // White halo for readability
        'text-halo-width': 1.5,
        'text-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 0.6,
          12, 0.8,
          14, 1.0
        ]
      },
      filter: [
        'all',
        ['has', 'name'], // Only show labels for roads with names
        [
          'in',
          ['get', 'highway'],
          ['literal', [
            'primary', 
            'secondary', 
            'tertiary', 
            'trunk',
            'primary_link',
            'secondary_link',
            'tertiary_link',
            'trunk_link',
            'residential',
            'living_street'
          ]]
        ] // Only show labels for major road types
      ]
    });
  }
  console.log(`Added ${roadFeatures.length} road features with labels`);
};

export const addRoadsLayerChunked = async (map: maplibregl.Map, roadFeatures: any[], isMobile: boolean = false) => {
  if (roadFeatures.length === 0) return;
  
  const chunkSize = isMobile ? 2000 : 10000;
  const delay = isMobile ? 100 : 50;
  
  console.log(`🛣️ Loading ${roadFeatures.length} roads in center-out chunks of ${chunkSize} (mobile: ${isMobile})`);
  
  // Remove existing roads layer if it exists
  if (map.getLayer('roads-labels')) {
    map.removeLayer('roads-labels');
  }
  if (map.getLayer('roads-layer')) {
    map.removeLayer('roads-layer');
  }
  if (map.getSource('roads')) {
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
      'line-width': [
        'interpolate', 
        ['linear'], 
        ['zoom'],
        10, 1,
        14, 2,
        16, 3,
        18, 4
      ]
    }
  });

  // Add road labels layer
  map.addLayer({
    id: 'roads-labels',
    type: 'symbol',
    source: 'roads',
    layout: {
      'text-field': [
        'case',
        ['has', 'name'],
        ['get', 'name'],
        ''
      ],
      'text-font': ['Open Sans Regular'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 10,
        14, 12,
        16, 14,
        18, 16
      ],
      'symbol-placement': 'line',
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
      'text-max-angle': 30,
      'text-padding': 10,
      'text-allow-overlap': false,
      'text-ignore-placement': false
    },
    paint: {
      'text-color': '#2D3748',
      'text-halo-color': 'rgba(255, 255, 255, 0.8)',
      'text-halo-width': 1.5,
      'text-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 0.6,
        12, 0.8,
        14, 1.0
      ]
    },
    filter: [
      'all',
      ['has', 'name'],
      [
        'in',
        ['get', 'highway'],
        ['literal', [
          'primary', 
          'secondary', 
          'tertiary', 
          'trunk',
          'primary_link',
          'secondary_link',
          'tertiary_link',
          'trunk_link',
          'residential',
          'living_street'
        ]]
      ]
    ]
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
  
  console.log(`✅ All ${sortedRoads.length} road features loaded center-out successfully with labels`);
};

export const ensureLayerOrder = (map: maplibregl.Map) => {
  // Ensure proper layer ordering: roads over water/parks, labels over roads, businesses over everything
  if (map.getLayer('roads-layer')) {
    map.moveLayer('roads-layer');
  }
  if (map.getLayer('roads-labels')) {
    map.moveLayer('roads-labels');
  }
  if (map.getLayer('businesses-layer')) {
    map.moveLayer('businesses-layer');
  }
};

// // Enhanced business layer with proper navigation
// export const addBusinessesLayer = (
//   map: maplibregl.Map,
//   businesses: any[],
//   selectedBusiness?: any,
//   onBusinessClick?: (business: any) => void,
//   onBusinessOpen?: (business: any) => void // New callback for opening/navigating to business details
// ) => {
//   try {
//     console.log(`🏢 Adding ${businesses.length} businesses to MapLibre layer`);
    
//     // Clean up existing layer and event handlers
//     if (map.getLayer('businesses-layer')) {
//       // Remove layer and let MapLibre clean up event handlers
//       map.removeLayer('businesses-layer');
//     }
//     if (map.getSource('businesses')) {
//       map.removeSource('businesses');
//     }

//     const businessFeatures = businesses.map(business => ({
//       type: 'Feature' as const,
//       geometry: { 
//         type: 'Point' as const, 
//         coordinates: [business.position.lng, business.position.lat] 
//       },
//       properties: { 
//         id: business.id, 
//         name: business.name, 
//         businessType: business.businessType || 'unknown',
//         // Include all business data in properties for easy access
//         address: business.address,
//         phone: business.phone,
//         website: business.website,
//         rating: business.rating
//       }
//     }));

//     map.addSource('businesses', {
//       type: 'geojson',
//       data: { type: 'FeatureCollection', features: businessFeatures }
//     });

//     map.addLayer({
//       id: 'businesses-layer',
//       type: 'circle',
//       source: 'businesses',
//       paint: {
//         'circle-radius': 8,
//         'circle-color': selectedBusiness ? [
//           'case',
//           ['==', ['get', 'id'], selectedBusiness.id],
//           '#EF4444', // Red for selected
//           '#FACC15'  // Yellow for others
//         ] : '#FACC15', // Yellow for all if none selected
//         'circle-stroke-width': 2,
//         'circle-stroke-color': '#FFFFFF',
//         'circle-opacity': 0.9
//       }
//     });

//     // Enhanced click handler with navigation
//     const clickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
//       console.log('🎯 MapLibre business click detected!', e.features?.[0]?.properties);
      
//       if (e.features?.[0]) {
//         const businessId = e.features[0].properties?.id;
//         const business = businesses.find(b => b.id === businessId);
        
//         if (business) {
//           console.log('🎯 Found business for click:', business.name, 'ID:', business.id);
          
//           // First, handle the map click (selection, flyTo, etc.)
//           if (onBusinessClick) {
//             onBusinessClick(business);
//           }
          
//           // Fly to the business location
//           map.flyTo({
//             center: [business.position.lng, business.position.lat],
//             zoom: Math.max(16, map.getZoom() || 12),
//             duration: 800,
//             essential: true
//           });
          
//           // Then handle opening/navigating to business details
//           if (onBusinessOpen) {
//             console.log('🚀 Opening business details for:', business.name);
//             // Add a small delay to let the map animation start
//             setTimeout(() => {
//               onBusinessOpen(business);
//             }, 100);
//           } else {
//             console.warn('⚠️ No onBusinessOpen handler provided - cannot navigate to business details');
//           }
//         } else {
//           console.error('❌ Business not found for ID:', businessId);
//         }
//       } else {
//         console.warn('⚠️ Click event has no features');
//       }
//     };

//     // Mouse interaction handlers
//     const mouseEnterHandler = () => {
//       map.getCanvas().style.cursor = 'pointer';
//     };

//     const mouseLeaveHandler = () => {
//       map.getCanvas().style.cursor = '';
//     };

//     // Add event handlers with proper function references
//     map.on('click', 'businesses-layer', clickHandler);
//     map.on('mouseenter', 'businesses-layer', mouseEnterHandler);
//     map.on('mouseleave', 'businesses-layer', mouseLeaveHandler);

//     console.log(`✅ Successfully added ${businesses.length} businesses with click handlers`);

//     // Return cleanup function
//     return () => {
//       console.log('🧹 Cleaning up MapLibre business layer event handlers');
//       map.off('click', 'businesses-layer', clickHandler);
//       map.off('mouseenter', 'businesses-layer', mouseEnterHandler);
//       map.off('mouseleave', 'businesses-layer', mouseLeaveHandler);
//     };
    
//   } catch (error) {
//     console.error('❌ Error adding businesses layer:', error);
//   }
// };

// // Utility function to update business selection
// export const updateSelectedBusiness = (map: maplibregl.Map, selectedBusiness?: any) => {
//   if (!map.getLayer('businesses-layer')) return;
  
//   map.setPaintProperty('businesses-layer', 'circle-color', selectedBusiness ? [
//     'case',
//     ['==', ['get', 'id'], selectedBusiness.id],
//     '#EF4444', // Red for selected
//     '#FACC15'  // Yellow for others
//   ] : '#FACC15'); // Yellow for all if none selected
// };

// // Utility function to add popup on hover (optional enhancement)
// export const addBusinessPopup = (map: maplibregl.Map, businesses: any[]) => {
//   const popup = new maplibregl.Popup({
//     closeButton: false,
//     closeOnClick: false
//   });

//   const mouseEnterHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
//     if (e.features?.[0]) {
//       const businessId = e.features[0].properties?.id;
//       const business = businesses.find(b => b.id === businessId);
      
//       if (business) {
//         popup.setLngLat([business.position.lng, business.position.lat])
//           .setHTML(`
//             <div style="font-family: system-ui; padding: 8px;">
//               <strong>${business.name}</strong><br>
//               <small>${business.businessType || 'Business'}</small>
//               ${business.rating ? `<br>⭐ ${business.rating}` : ''}
//             </div>
//           `)
//           .addTo(map);
//       }
//     }
//   };

//   const mouseLeaveHandler = () => {
//     popup.remove();
//   };

//   map.on('mouseenter', 'businesses-layer', mouseEnterHandler);
//   map.on('mouseleave', 'businesses-layer', mouseLeaveHandler);

//   return () => {
//     popup.remove();
//     map.off('mouseenter', 'businesses-layer', mouseEnterHandler);
//     map.off('mouseleave', 'businesses-layer', mouseLeaveHandler);
//   };
// };

// // Utility function to focus on a specific business
// export const focusOnBusiness = (map: maplibregl.Map, business: any, zoom: number = 16) => {
//   if (!business?.position) return;
  
//   map.flyTo({
//     center: [business.position.lng, business.position.lat],
//     zoom: Math.max(zoom, map.getZoom() || 12),
//     duration: 1000,
//     essential: true
//   });
// };