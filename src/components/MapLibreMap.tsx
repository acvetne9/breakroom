import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
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

  // Better strategy: Process explicit features first, then use intelligent defaults
  const processGeographicFeatures = useCallback((geoData: FeatureCollection) => {
    console.log(`Processing ${geoData.features.length} geographic features...`);
    
    // 1. Extract explicit water features
    const explicitWater = geoData.features.filter(feature => {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
      
      const props = feature.properties || {};
      const name = (props.name || '').toLowerCase();
      
      // Direct water tags
      if (props.natural === 'water' || props.natural === 'bay') return true;
      if (props.waterway) return true;
      if (props.place === 'sea' || props.place === 'ocean') return true;
      
      // Named water bodies
      if (waterKeywords.some(waterName => 
        name.includes(waterName.toLowerCase()) ||
        name === waterName.toLowerCase()
      )) return true;
      
      return false;
    }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];

    // 2. Extract explicit land features (parks, forests, etc.)
    const explicitLand = geoData.features.filter(feature => {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
      
      const props = feature.properties || {};
      const name = (props.name || '').toLowerCase();
      
      // Parks and leisure
      if (['park', 'garden', 'recreation_ground', 'playground'].includes(props.leisure)) return true;
      
      // Natural land features
      if (['wood', 'forest', 'grassland', 'scrub', 'sand', 'beach'].includes(props.natural)) return true;
      
      // Cemeteries
      if (props.leisure === 'cemetery' || cemeteryKeywords.some(keyword => name.includes(keyword))) return true;
      
      // Famous land areas
      if (['central park', 'prospect park', 'bryant park', 'governors island', 
           'staten island', 'liberty island', 'ellis island'].some(landmark => 
           name.includes(landmark))) return true;
      
      return false;
    }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];

    // 3. Process coastlines for land/water boundaries
    const coastlines = geoData.features.filter(feature => 
      feature.geometry.type === 'LineString' && 
      feature.properties?.natural === 'coastline'
    ) as Feature<LineString, { [name: string]: any }>[];

    console.log(`Found: ${explicitWater.length} water, ${explicitLand.length} land, ${coastlines.length} coastlines`);
    
    return { explicitWater, explicitLand, coastlines };
  }, [waterKeywords, cemeteryKeywords]);

  // Create base land/water from coastlines only when needed
  const createBaseGeography = useCallback((coastlines: Feature<LineString, { [name: string]: any }>[]) => {
    const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
    
    if (coastlines.length === 0) {
      // No coastlines - create simple land area
      const landArea = turf.bboxPolygon(bbox);
      return {
        baseLand: [{
          ...landArea,
          properties: { landType: 'default-area', source: 'no-coastlines' }
        } as Feature<Polygon, { [name: string]: any }>],
        baseWater: [] as Feature<Polygon | MultiPolygon, { [name: string]: any }>[]
      };
    }

    // Try to create land polygons from coastlines
    let baseLand: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];
    
    try {
      // Buffer coastlines slightly to create land areas
      const bufferedLand = coastlines.map(coastline => {
        try {
          const buffered = turf.buffer(coastline, 0.002, { units: 'degrees' });
          return {
            ...buffered,
            properties: { landType: 'coastline-buffered', source: 'coastline-processing' }
          } as Feature<Polygon | MultiPolygon, { [name: string]: any }>;
        } catch (err) {
          console.warn('Failed to buffer coastline:', err);
          return null;
        }
      }).filter(Boolean) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
      
      baseLand = bufferedLand;
    } catch (error) {
      console.warn('Coastline processing failed, using bbox:', error);
      const landArea = turf.bboxPolygon(bbox);
      baseLand = [{
        ...landArea,
        properties: { landType: 'fallback-bbox', source: 'error-recovery' }
      } as Feature<Polygon, { [name: string]: any }>];
    }

    return {
      baseLand,
      baseWater: [] as Feature<Polygon | MultiPolygon, { [name: string]: any }>[]
    };
  }, []);

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

      // Process geographic features intelligently
      const { explicitWater, explicitLand, coastlines } = processGeographicFeatures(mainData);
      
      // Create base geography only if we have very few explicit features
      let baseLand: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];
      let baseWater: Feature<Polygon | MultiPolygon, { [name: string]: any }>[] = [];
      
      if (explicitLand.length < 5 || explicitWater.length < 3) {
        console.log('Creating base geography from coastlines...');
        const baseGeography = createBaseGeography(coastlines);
        baseLand = baseGeography.baseLand;
        baseWater = baseGeography.baseWater;
      }
      
      // Combine explicit and base features
      const allLandFeatures = [...baseLand, ...explicitLand];
      const allWaterFeatures = [...baseWater, ...explicitWater];
      
      console.log(`Final result: ${allLandFeatures.length} land features, ${allWaterFeatures.length} water features`);
      
      // Separate parks from other land for better rendering
      const parkFeatures = explicitLand.filter(feature => {
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          ['park', 'garden', 'recreation_ground', 'playground'].includes(props.leisure) ||
          props.leisure === 'cemetery' ||
          cemeteryKeywords.some(keyword => name.includes(keyword)) ||
          ['central park', 'prospect park', 'bryant park'].some(parkName => name.includes(parkName))
        );
      });
      
      const nonParkLand = allLandFeatures.filter(feature => {
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return !(
          ['park', 'garden', 'recreation_ground', 'playground'].includes(props.leisure) ||
          props.leisure === 'cemetery' ||
          cemeteryKeywords.some(keyword => name.includes(keyword)) ||
          ['central park', 'prospect park', 'bryant park'].some(parkName => name.includes(parkName))
        );
      });
      
      setLandData({ type: 'FeatureCollection', features: nonParkLand });
      setWaterData({ type: 'FeatureCollection', features: allWaterFeatures });
      setParksData({ type: 'FeatureCollection', features: parkFeatures });
      
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, processGeographicFeatures, createBaseGeography, cemeteryKeywords]);

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

    // 2. SECOND: Base land areas (only non-park land on top of parks)
    addOrUpdateSource('land-data', landData, {
      id: 'land-base',
      type: 'fill',
      source: 'land-data',
      paint: { 
        'fill-color': '#D2B48C', // Sandy brown for natural land
        'fill-opacity': 0.7
      }
    });

    // 3. THIRD: Water bodies (only on top where water actually exists)
    addOrUpdateSource('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 
        'fill-color': '#4A90E2', 
        'fill-opacity': 0.8
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