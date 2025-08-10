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

  // Unified cemetery detection function
  const detectCemeteries = useCallback((mainData: FeatureCollection) => {
    if (!map || !mapLoaded) return;

    const cemeteryFeatures: Feature[] = [];

    mainData.features.forEach(feature => {
      const props = feature.properties;
      if (!props) return;

      const name = props.name ? props.name.toLowerCase() : '';
      const isCemetery = cemeteryKeywords.some(keyword => name.includes(keyword)) ||
                        props.leisure === 'cemetery' ||
                        props.natural === 'cemetery';

      // Location-based detection
      let nearKnownCemetery = false;
      if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
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
      }

      if (isCemetery || nearKnownCemetery) {
        cemeteryFeatures.push(feature);
      }
    });

    console.log(`Found ${cemeteryFeatures.length} cemetery features`);

    if (cemeteryFeatures.length > 0) {
      const cemeteryFC = { type: 'FeatureCollection' as const, features: cemeteryFeatures };
      
      // Clean up existing layers
      ['cemeteries-layer', 'cemeteries-border', 'cemeteries-points'].forEach(layerId => {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      });
      if (map.getSource('cemetery-data')) map.removeSource('cemetery-data');
      
      map.addSource('cemetery-data', { type: 'geojson', data: cemeteryFC });
      
      // Polygon cemeteries
      map.addLayer({
        id: 'cemeteries-layer',
        type: 'fill',
        source: 'cemetery-data',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: { 'fill-color': '#2E7D32', 'fill-opacity': 0.9 }
      });
      
      map.addLayer({
        id: 'cemeteries-border',
        type: 'line',
        source: 'cemetery-data',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: { 'line-color': '#1B5E20', 'line-width': 2 }
      });
      
      // Point cemeteries
      map.addLayer({
        id: 'cemeteries-points',
        type: 'circle',
        source: 'cemetery-data',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#2E7D32',
          'circle-radius': 6,
          'circle-stroke-color': '#1B5E20',
          'circle-stroke-width': 2
        }
      });
    }
  }, [map, mapLoaded, cemeteryKeywords, knownCemeteryAreas]);

  const createLandFromCoastlines = useCallback((geoData: FeatureCollection): FeatureCollection<Polygon | MultiPolygon> => {
    try {
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' && feature.properties?.natural === 'coastline'
      );

      if (coastlines.length === 0) {
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

      const bbox: [number, number, number, number] = [-74.30, 40.50, -73.70, 40.93];
      let totalLandArea = turf.bboxPolygon(bbox);
      
      const explicitWaterBodies = geoData.features.filter(feature => {
        const props = feature.properties;
        return props && 
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
          (props.natural === 'water' || 
           (props.name && waterKeywords.some(waterName => 
             props.name.toLowerCase().includes(waterName.toLowerCase()))));
      });
      
      explicitWaterBodies.forEach(waterBody => {
        try {
          const difference = (turf as any).difference(totalLandArea, waterBody);
          if (difference) totalLandArea = difference;
        } catch (err) {
          console.warn('Could not subtract water body:', err);
        }
      });
      
      if (totalLandArea) {
        const landFeature = totalLandArea as unknown as Feature<Polygon | MultiPolygon, { [name: string]: any }>;
        landFeature.properties = { landType: 'comprehensive', source: 'water-subtraction' };
        return { type: 'FeatureCollection', features: [landFeature] };
      }

    } catch (error) {
      console.error('Error creating land from coastlines:', error);
    }
    
    return { type: 'FeatureCollection', features: [] };
  }, [waterKeywords]);

  const loadGeographicData = useCallback(async () => {
    try {
      // Load roads
      const roadsResponse = await fetch('/data/merged_roads.geojson.gz');
      if (roadsResponse.ok) {
        const roadsData = await roadsResponse.json();
        setRoadsData(roadsData);
      }
      
      const mainData = await loadGeoJSONData();
      if (!mainData) return;

      console.log(`Processing ${mainData.features.length} total features`);

      // Apply cemetery detection after map is ready
      setTimeout(() => detectCemeteries(mainData), 1000);
      
      // Process land features
      const landFeatures = mainData.features.filter(feature => {
        const props = feature.properties;
        if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        
        return (
          // Cemetery detection
          (props.name && cemeteryKeywords.some(keyword => 
            props.name.toLowerCase().includes(keyword))) ||
          
          // Leisure areas
          ['park', 'playground', 'pitch', 'garden', 'golf_course', 'recreation_ground', 
           'stadium', 'sports_centre'].includes(props.leisure) ||
          
          // Natural areas
          ['wood', 'forest', 'grassland', 'scrub', 'heath', 'fell', 'bare_rock', 
           'scree', 'sand', 'beach', 'land'].includes(props.natural) ||
          
          // Famous parks
          (props.name && ['central park', 'prospect park', 'battery park', 'bryant park',
           'madison square park', 'washington square park', 'riverside park',
           'governors island', 'staten island', 'liberty island', 'ellis island']
           .some(landName => props.name.toLowerCase().includes(landName)))
        );
      }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];
      
      // Helper: check if polygon has a long straight border touching any water polygon
      const touchesWaterWithStraightEdge = (
        feature: Feature<Polygon | MultiPolygon, any>,
        knownWater: Feature<Polygon | MultiPolygon, any>[],
        minStraightLength = 200, // meters
        minArea = 50000 // m²
      ) => {
        try {
          const area = turf.area(feature);
          if (area < minArea) return false; // too small to consider
      
          const coordsArray = feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates
            : feature.geometry.coordinates.flat();
      
          // For each ring in the polygon
          for (const ring of coordsArray) {
            for (let i = 0; i < ring.length - 1; i++) {
              const p1 = ring[i];
              const p2 = ring[i + 1];
              const segment = turf.lineString([p1, p2]);
              const length = turf.length(segment, { units: 'meters' });
      
              if (length >= minStraightLength) {
                // See if this edge touches any known water polygon
                for (const water of knownWater) {
                  if (turf.booleanTouches(segment, water)) {
                    return true;
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn("Error checking straight edge water touch:", err);
        }
        return false;
      };

      const waterFeatures = mainData.features.filter(feature => {
        const props = feature.properties;
        if (!props || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
      
        // Standard detection
        const isWater = (
          ['water', 'bay', 'strait'].includes(props.natural) ||
          (props.name && waterKeywords.some(waterName => {
            const name = props.name.toLowerCase();
            const water = waterName.toLowerCase();
            return name === water || name.includes(water) ||
                   (water.includes('bay') && name.includes('bay')) ||
                   (water.includes('river') && name.includes('river')) ||
                   (water.includes('kill') && name.includes('kill'));
          }))
        );
      
        if (!isWater) {
          // Narrow known water to polygon types only
          const knownWater = mainData.features.filter((f): f is Feature<Polygon | MultiPolygon, any> =>
            (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
            (f.properties?.natural === 'water' ||
             (f.properties?.name && waterKeywords.some(w =>
               f.properties!.name.toLowerCase().includes(w.toLowerCase()))))
          );
          return touchesWaterWithStraightEdge(feature as Feature<Polygon | MultiPolygon, any>, knownWater);
        }
      
        return isWater;
      }) as Feature<Polygon | MultiPolygon, { [name: string]: any }>[];

      console.log(`Found ${landFeatures.length} land features, ${waterFeatures.length} water features`);
      
      // Generate land from coastlines if needed
      if (landFeatures.length < 10) {
        const coastlineGenerated = createLandFromCoastlines(mainData);
        const typedCoastlineFeatures = coastlineGenerated.features.filter(
          (feature): feature is Feature<Polygon | MultiPolygon, { [name: string]: any }> => 
            feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
        );
        landFeatures.push(...typedCoastlineFeatures);
      }
      
      setLandData({ type: 'FeatureCollection', features: landFeatures });
      setWaterData({ type: 'FeatureCollection', features: waterFeatures });
      
    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, detectCemeteries, createLandFromCoastlines, cemeteryKeywords, waterKeywords]);

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
          paint: { 'background-color': '#D3D3D3' }
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

        mapInstance!.addSource('geojson-data', { type: 'geojson', data: geoData });

        // Add basic layers
        const layers = [
          { id: 'parks', filter: ['==', 'leisure', 'park'], paint: { 'fill-color': '#4CAF50', 'fill-opacity': 0.8 } },
          { id: 'coastlines', type: 'line', filter: ['==', 'natural', 'coastline'], paint: { 'line-color': '#1976D2', 'line-width': 2 } },
          { id: 'buildings', filter: ['has', 'building'], paint: { 'fill-color': '#BDBDBD', 'fill-opacity': 0.7 } }
        ];

        layers.forEach(layer => {
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

  // Load geographic data
  useEffect(() => {
    loadGeographicData();
  }, [loadGeographicData]);

  // Add geographic layers
  useEffect(() => {
    if (!mapLoaded || !map) return;

    const addOrUpdateSource = (sourceId: string, data: FeatureCollection | null, layer: any) => {
      if (!data) return;
      
      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data as any);
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      } else {
        map.addSource(sourceId, { type: 'geojson', data });
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
    };

    // Land areas with enhanced cemetery/park colors
    addOrUpdateSource('land-data', landData, {
      id: 'land-areas',
      type: 'fill',
      source: 'land-data',
      paint: { 
        'fill-color': [
          'case',
          // Cemetery detection
          ['any', ...cemeteryKeywords.map(keyword => 
            ['in', keyword, ['downcase', ['coalesce', ['get', 'name'], '']]])],
          '#2E7D32',
          // Parks
          ['any',
            ['==', ['get', 'leisure'], 'park'],
            ['==', ['get', 'leisure'], 'garden'],
            ['==', ['get', 'leisure'], 'playground'],
            ['==', ['get', 'leisure'], 'golf_course']
          ], '#4CAF50',
          // Natural vegetation
          ['any',
            ['==', ['get', 'natural'], 'wood'],
            ['==', ['get', 'natural'], 'forest']
          ], '#388E3C',
          '#E8F5E8' // Default land color
        ],
        'fill-opacity': 0.9 
      }
    });

    addOrUpdateSource('water-data', waterData, {
      id: 'water-bodies',
      type: 'fill',
      source: 'water-data',
      paint: { 'fill-color': '#4A90E2', 'fill-opacity': 0.8 }
    });

    addOrUpdateSource('roads-data', roadsData, {
      id: 'roads',
      type: 'line',
      source: 'roads-data',
      paint: { 'line-color': '#666666', 'line-width': 1.5 }
    });

    // Ensure businesses layer stays on top
    if (map.getLayer('businesses-layer')) {
      map.moveLayer('businesses-layer');
    }
  }, [mapLoaded, map, landData, waterData, roadsData, cemeteryKeywords]);

  // Business markers
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) return;

    // Clean up existing
    if (map.getSource('businesses')) {
      map.removeLayer('businesses-layer');
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
      map.on('click', 'businesses-layer', (e) => {
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
      });
    }

    map.on('mouseenter', 'businesses-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'businesses-layer', () => {
      map.getCanvas().style.cursor = '';
    });

  }, [mapLoaded, businesses, onBusinessClick]);

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