import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';

interface MapLibreMapProps {
  businesses: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: { id: string; text: string; author: string }[];
    businessType?: string;
    roles?: {
      role: string;
      salary: string;
      upvotes?: number;
      downvotes?: number;
      userVote?: 'up' | 'down';
    }[];
    place_id?: string;
  }[];
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [roadsData, setRoadsData] = useState<FeatureCollection<LineString> | null>(null);
  const [landData, setLandData] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [waterData, setWaterData] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [parksData, setParksData] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  // Cemetery detection keywords
  const cemeteryKeywords = [
    'cemetery', 'cemetary', 'calvary', 'green-wood', 'greenwood', 'woodlawn', 
    'evergreens', 'cypress', 'memorial', 'rest', 'mount', 'saint', 'holy'
  ];

  const waterKeywords = [
    'Upper New York Bay', 'Lower New York Bay', 'Newark Bay', 'Jamaica Bay',
    'Long Island Sound', 'Hudson River', 'East River', 'Harlem River',
    'Arthur Kill', 'Kill Van Kull', 'Raritan Bay', 'Sheepshead Bay',
    'Rockaway Inlet', 'Gowanus Canal', 'Newtown Creek'
  ];

  const knownCemeteryAreas = [
    { name: "Green-Wood Cemetery", center: [-73.9932, 40.6551], radius: 0.01 },
    { name: "Calvary Cemetery", center: [-73.9057, 40.7441], radius: 0.008 },
    { name: "Woodlawn Cemetery", center: [-73.8681, 40.8971], radius: 0.007 },
    { name: "Cypress Hills Cemetery", center: [-73.8813, 40.6851], radius: 0.006 },
    { name: "Evergreens Cemetery", center: [-73.9052, 40.6910], radius: 0.005 },
    { name: "Mount Hebron Cemetery", center: [-73.8440, 40.6340], radius: 0.004 }
  ];

  // Create land polygon from coastlines - land is INSIDE coastlines
  const createLandFromCoastlines = useCallback((geoData: FeatureCollection): FeatureCollection<Polygon | MultiPolygon> => {
    try {
      console.log('Creating land from coastlines...');
      
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' && feature.properties?.natural === 'coastline'
      ) as Feature<LineString, { [name: string]: any }>[];

      console.log(`Found ${coastlines.length} coastline features`);

      if (coastlines.length === 0) {
        // Fallback: create default land area
        const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
        const landArea = turf.bboxPolygon(bbox);
        return {
          type: 'FeatureCollection',
          features: [{
            ...landArea,
            properties: { landType: 'default-bbox', source: 'fallback' }
          } as Feature<Polygon, { [name: string]: any }>]
        };
      }

      // Process coastlines to create enclosed land polygons
      let landPolygons: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];

      try {
        // Attempt to merge all coastline segments
        let mergedCoastlines;
        if (coastlines.length > 1) {
          const combined = turf.combine(turf.featureCollection(coastlines));
          // Check if combined result has features
          if (combined.features && combined.features.length > 0) {
            // Try to convert first feature to polygon
            mergedCoastlines = turf.lineToPolygon(combined.features[0] as Feature<LineString | MultiLineString>);
          }
        } else if (coastlines.length === 1) {
          mergedCoastlines = turf.lineToPolygon(coastlines[0]);
        }
        
        if (mergedCoastlines) {
          // Handle both single Feature and FeatureCollection returns from lineToPolygon
          if (mergedCoastlines.type === 'FeatureCollection') {
            landPolygons = mergedCoastlines.features.map(feature => ({
              ...feature,
              properties: { landType: 'coastline-enclosed', source: 'coastline-processing' }
            })) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
          } else if (mergedCoastlines.type === 'Feature') {
            landPolygons = [{
              ...mergedCoastlines,
              properties: { landType: 'coastline-enclosed', source: 'coastline-processing' }
            }] as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
          }
        }
      } catch (polygonError) {
        console.warn('Failed to create polygons from coastlines, using buffer method:', polygonError);
        
        // Alternative: buffer and union approach
        try {
          const bufferedCoastlines = coastlines.map(coastline => {
            return turf.buffer(coastline, 0.001, { units: 'degrees' });
          });
          
          if (bufferedCoastlines.length > 0) {
            let unionedLand = bufferedCoastlines[0];
            for (let i = 1; i < bufferedCoastlines.length; i++) {
              try {
                const union = (turf as any).union(unionedLand, bufferedCoastlines[i]);
                if (union) unionedLand = union;
              } catch (unionError) {
                console.warn('Failed to union coastline buffers:', unionError);
              }
            }
            
            landPolygons = [{
              ...unionedLand,
              properties: { landType: 'coastline-buffered', source: 'buffer-method' }
            } as Feature<Polygon | MultiPolygon, { [name: string]: any }>];
          }
        } catch (bufferError) {
          console.warn('Buffer method also failed:', bufferError);
        }
      }

      if (landPolygons.length === 0) {
        // Final fallback: use bbox
        const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
        const landArea = turf.bboxPolygon(bbox);
        landPolygons = [{
          ...landArea,
          properties: { landType: 'final-fallback', source: 'bbox-fallback' }
        } as Feature<Polygon, { [name: string]: any }>];
      }

      console.log(`Created ${landPolygons.length} land polygons from coastlines`);
      return { type: 'FeatureCollection', features: landPolygons };

    } catch (error) {
      console.error('Error creating land from coastlines:', error);
      // Ultimate fallback
      const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
      const landArea = turf.bboxPolygon(bbox);
      return {
        type: 'FeatureCollection',
        features: [{
          ...landArea,
          properties: { landType: 'error-fallback', source: 'error-recovery' }
        } as Feature<Polygon, { [name: string]: any }>]
      };
    }
  }, []);

  // Create water polygon from coastlines - water is OUTSIDE coastlines  
  const createWaterFromCoastlines = useCallback((geoData: FeatureCollection, landPolygons: FeatureCollection<Polygon | MultiPolygon>): FeatureCollection<Polygon | MultiPolygon> => {
    try {
      console.log('Creating water from coastlines...');
      
      // Create a large bounding box that encompasses the entire area
      const bbox: [number, number, number, number] = [-74.35, 40.45, -73.65, 40.98];
      let totalWaterArea = turf.bboxPolygon(bbox);

      // Subtract all land polygons from the total area to get water
      landPolygons.features.forEach(landFeature => {
        try {
          const difference = (turf as any).difference(totalWaterArea, landFeature);
          if (difference) {
            totalWaterArea = difference;
          }
        } catch (err) {
          console.warn('Could not subtract land from water area:', err);
        }
      });

      // Also add explicit water bodies from the data
      const explicitWaterBodies = geoData.features.filter(feature => {
        const props = feature.properties;
        return props && 
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
          (props.natural === 'water' || 
           (props.name && waterKeywords.some(waterName => 
             props.name.toLowerCase().includes(waterName.toLowerCase()))));
      }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];

      const waterFeatures: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];
      
      // Add the coastline-derived water
      if (totalWaterArea) {
        waterFeatures.push({
          ...totalWaterArea,
          properties: { waterType: 'coastline-derived', source: 'coastline-subtraction' }
        } as Feature<Polygon | MultiPolygon, { [name: string]: any }>);
      }

      // Add explicit water bodies
      explicitWaterBodies.forEach(waterBody => {
        waterFeatures.push({
          ...waterBody,
          properties: { 
            ...waterBody.properties, 
            waterType: 'explicit', 
            source: 'geojson-data' 
          }
        });
      });

      console.log(`Created ${waterFeatures.length} water polygons from coastlines`);
      return { type: 'FeatureCollection', features: waterFeatures };

    } catch (error) {
      console.error('Error creating water from coastlines:', error);
      return { type: 'FeatureCollection', features: [] };
    }
  }, [waterKeywords]);

  const loadGeographicData = useCallback(async () => {
    try {
      console.log('Loading geographic data...');
      
      // Load roads
      const roadsResponse = await fetch('/data/merged_roads.geojson.gz');
      if (roadsResponse.ok) {
        const roadsData = await roadsResponse.json();
        setRoadsData(roadsData);
        console.log('Roads data loaded successfully');
      }
      
      const mainData = await loadGeoJSONData();
      if (!mainData) {
        console.error('No main data loaded');
        return;
      }

      console.log(`Processing ${mainData.features.length} total features`);

      // Step 1: Create base land from coastlines
      const coastlineLand = createLandFromCoastlines(mainData);
      
      // Step 2: Create water from coastlines (everything outside land)
      const coastlineWater = createWaterFromCoastlines(mainData, coastlineLand);
      
      // Step 3: Process parks and other land features (these go ON TOP of base land)
      const parkFeatures = mainData.features.filter(feature => {
        const props = feature.properties;
        if (!props) return false;
        
        // Only include polygon/multipolygon features
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        
        const name = props.name ? props.name.toLowerCase() : '';
        
        // Cemetery detection
        const isCemetery = cemeteryKeywords.some(keyword => name.includes(keyword)) ||
                          props.leisure === 'cemetery' ||
                          props.natural === 'cemetery';
        
        // Location-based cemetery detection
        let nearKnownCemetery = false;
        try {
          const centroid = turf.centroid(feature);
          const [lng, lat] = centroid.geometry.coordinates;
          
          nearKnownCemetery = knownCemeteryAreas.some(cemetery => {
            const distance = Math.sqrt(
              Math.pow(lng - cemetery.center[0], 2) + 
              Math.pow(lat - cemetery.center[1], 2)
            );
            return distance < cemetery.radius;
          });
        } catch (err) {
          // Ignore centroid calculation errors
        }
        
        return (
          // Cemetery detection
          isCemetery || nearKnownCemetery ||
          
          // Leisure areas
          ['park', 'playground', 'pitch', 'garden', 'golf_course', 'recreation_ground', 
           'stadium', 'sports_centre', 'nature_reserve'].includes(props.leisure) ||
          
          // Natural areas (but not water)
          ['wood', 'forest', 'grassland', 'scrub', 'heath', 'fell', 'bare_rock', 
           'scree', 'sand', 'beach'].includes(props.natural) ||
          
          // Famous parks
          (props.name && ['central park', 'prospect park', 'battery park', 'bryant park',
           'madison square park', 'washington square park', 'riverside park']
           .some(parkName => props.name.toLowerCase().includes(parkName)))
        );
      }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
      
      console.log(`Found ${coastlineLand.features.length} coastline land areas`);
      console.log(`Found ${coastlineWater.features.length} coastline water areas`);
      console.log(`Found ${parkFeatures.length} park features`);
      
      setLandData(coastlineLand);
      setWaterData(coastlineWater);
      setParksData({ type: 'FeatureCollection', features: parkFeatures });
      
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, createLandFromCoastlines, createWaterFromCoastlines, cemeteryKeywords, knownCemeteryAreas]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      const baseStyle = {
        version: 8 as const,
        sources: {},
        layers: [{
          id: 'background',
          type: 'background' as const,
          paint: { 'background-color': '#F5F5DC' } // Land color as background
        }]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      mapInstance.setMaxBounds([[-74.25909, 40.477399], [-73.700272, 40.917577]]);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;
        setMapLoaded(true);

        const geoData = await loadGeoJSONData();
        if (!geoData?.features.length) {
          console.warn('No GeoJSON features loaded.');
          return;
        }

        // Fit map to data
        try {
          const dataBbox = turf.bbox(geoData) as [number, number, number, number];
          if (dataBbox[0] !== dataBbox[2] && dataBbox[1] !== dataBbox[3]) {
            mapInstance!.fitBounds(dataBbox, { padding: 100, duration: 1000 });
          }
        } catch (err) {
          console.warn('Could not calculate bbox:', err);
        }

        // Add original geojson source for compatibility
        mapInstance!.addSource('geojson-data', { type: 'geojson', data: geoData });

        // Add basic layers for backwards compatibility
        const compatibilityLayers = [
          { 
            id: 'coastlines', 
            type: 'line', 
            filter: ['==', 'natural', 'coastline'], 
            paint: { 'line-color': '#1976D2', 'line-width': 2 } 
          },
          { 
            id: 'buildings', 
            filter: ['has', 'building'], 
            paint: { 'fill-color': '#BDBDBD', 'fill-opacity': 0.7 } 
          }
        ];

        compatibilityLayers.forEach(layer => {
          mapInstance!.addLayer({
            id: layer.id,
            type: layer.type || 'fill',
            source: 'geojson-data',
            filter: layer.filter,
            paint: layer.paint
          } as any);
        });
      });

      mapInstance.on('error', e => console.error('Map error:', e.error));
      setMap(mapInstance);
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) mapInstance.remove();
      setMap(null);
    };
  }, [loadGeoJSONData]);

  // Load geographic data - run only once after map is loaded
  useEffect(() => {
    if (mapLoaded && map) {
      loadGeographicData();
    }
  }, [mapLoaded, map, loadGeographicData]);

  // Add geographic layers in proper order
  useEffect(() => {
    if (!mapLoaded || !map) return;

    const addOrUpdateSource = (sourceId: string, data: FeatureCollection | null, layer: any) => {
      if (!data || data.features.length === 0) return;
      
      try {
        const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(data as any);
          if (!map.getLayer(layer.id)) {
            map.addLayer(layer);
          }
        } else {
          map.addSource(sourceId, { type: 'geojson', data });
          if (!map.getLayer(layer.id)) {
            map.addLayer(layer);
          }
        }
        console.log(`Added/updated layer: ${layer.id} with ${data.features.length} features`);
      } catch (error) {
        console.error(`Error adding layer ${layer.id}:`, error);
      }
    };

    // CRITICAL: Add layers in correct rendering order (bottom to top)
    console.log('Adding geographic layers...');
    
    // 1. FIRST: Parks and special areas (bottom layer on top of background)
    addOrUpdateSource('parks-data', parksData, {
      id: 'parks-areas',
      type: 'fill',
      source: 'parks-data',
      paint: { 
        'fill-color': [
          'case',
          // Cemetery detection
          ['any', ...cemeteryKeywords.map(keyword => 
            ['in', keyword, ['downcase', ['coalesce', ['get', 'name'], '']]])],
          '#4CAF50', // Green for cemeteries
          // Parks and leisure areas
          ['!=', ['coalesce', ['get', 'leisure'], ''], ''],
          '#4CAF50', // Green for parks
          // Natural areas
          ['!=', ['coalesce', ['get', 'natural'], ''], ''],
          '#388E3C', // Darker green for natural areas
          '#4CAF50' // Default green
        ],
        'fill-opacity': 0.8
      }
    });

    // 2. SECOND: Base land areas from coastlines (on top of parks)
    addOrUpdateSource('land-data', landData, {
      id: 'land-base',
      type: 'fill',
      source: 'land-data',
      paint: { 
        'fill-color': '#E8E8E8', // Light gray land color to distinguish from background
        'fill-opacity': 0.6 // Semi-transparent so parks show through
      }
    });

    // 3. THIRD: Water bodies (on top of land)
    addOrUpdateSource('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 
        'fill-color': '#4A90E2', 
        'fill-opacity': 0.9 // High opacity for water visibility
      }
    });

    // 4. FOURTH: Roads (on top of everything)
    addOrUpdateSource('roads-data', roadsData, {
      id: 'roads',
      type: 'line',
      source: 'roads-data',
      paint: { 
        'line-color': '#666666', 
        'line-width': 1.5,
        'line-opacity': 0.8
      }
    });

    // 5. Add water outlines for better definition
    if (waterData && waterData.features.length > 0 && map.getSource('water-data') && !map.getLayer('water-outlines')) {
      try {
        map.addLayer({
          id: 'water-outlines',
          type: 'line',
          source: 'water-data',
          paint: {
            'line-color': '#2E7DD2',
            'line-width': 1.5,
            'line-opacity': 0.6
          }
        }, 'roads'); // Insert before roads layer
        console.log('Added water outlines');
      } catch (error) {
        console.error('Error adding water outlines:', error);
      }
    }

    // 6. LAST: Ensure businesses layer stays on top
    if (map.getLayer('businesses-layer')) {
      map.moveLayer('businesses-layer');
    }

  }, [mapLoaded, map, waterData, landData, parksData, roadsData, cemeteryKeywords]);

  // Business markers
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) return;

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
        'circle-color': '#FACC15',
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
      
      // Clean up on unmount
      return () => {
        map.off('click', 'businesses-layer', clickHandler);
      };
    }

    map.on('mouseenter', 'businesses-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'businesses-layer', () => {
      map.getCanvas().style.cursor = '';
    });

  }, [mapLoaded, businesses, onBusinessClick, map]);

  // Selected business highlighting
  useEffect(() => {
    if (!mapLoaded || !map || !map.getLayer('businesses-layer')) return;

    map.setPaintProperty('businesses-layer', 'circle-color', 
      selectedBusiness ? [
        'case',
        ['==', ['get', 'id'], selectedBusiness.id],
        '#EF4444',
        '#FACC15'
      ] : '#FACC15'
    );
  }, [mapLoaded, map, selectedBusiness]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;