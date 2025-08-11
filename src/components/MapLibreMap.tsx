import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, Geometry } from 'geojson';
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
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Enhanced feature processing with coastline-aware waterway buffering
  const processSimpleFeatures = useCallback(async (geoData: FeatureCollection) => {
    if (isProcessing) return; // Prevent multiple processing
    setIsProcessing(true);

    try {
      console.log(`Processing ${geoData.features.length} features...`);

      // Land/coastline detection - identify land polygons to avoid conflicts
      const landFeatures = geoData.features.filter((feature): feature is Feature<Polygon | MultiPolygon> => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.natural === 'land' ||
          props.natural === 'coastline' ||
          props.place === 'island' ||
          props.place === 'islet' ||
          name.includes('island') ||
          name.includes('land') ||
          // Administrative boundaries that represent land
          (props.admin_level && (props.landuse || props.natural === 'grassland'))
        );
      });

      // Water body detection (polygons/multipolygons)
      const waterBodyFeatures = geoData.features.filter((feature): feature is Feature<Polygon | MultiPolygon> => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.natural === 'water' || 
          props.natural === 'bay' || 
          props.waterway ||
          // Named water bodies
          ['river', 'bay', 'harbor', 'sound', 'creek', 'canal'].some(waterType => 
            name.includes(waterType)
          )
        );
      });

      // Waterway detection (linestrings)
      const waterwayFeatures = geoData.features.filter((feature): feature is Feature<LineString> => {
        if (feature.geometry.type !== 'LineString') return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.waterway || // Any waterway tag
          props.natural === 'waterway' ||
          // Common waterway types
          ['river', 'stream', 'canal', 'creek', 'brook'].some(waterType => 
            name.includes(waterType) || props.waterway === waterType
          )
        );
      });

      console.log(`Found ${waterBodyFeatures.length} water bodies, ${waterwayFeatures.length} waterways, ${landFeatures.length} land features`);

      // Create unified land mask for clipping operations
      let landMask: Feature<Polygon | MultiPolygon> | null = null;
      if (landFeatures.length > 0) {
        try {
          // Union all land features into a single geometry for efficient clipping
          let combinedLand = landFeatures[0];
          for (let i = 1; i < Math.min(landFeatures.length, 50); i++) { // Limit to prevent performance issues
            try {
              const unionResult = turf.union(
                turf.feature(combinedLand.geometry),
                turf.feature(landFeatures[i].geometry)
              );
              if (unionResult) combinedLand = unionResult as Feature<Polygon | MultiPolygon>;
            } catch (err) {
              console.warn('Failed to union land feature:', err);
            }
          }
          landMask = combinedLand;
          console.log('Created land mask for coastline clipping');
        } catch (err) {
          console.warn('Failed to create land mask:', err);
        }
      }

      // Buffer waterways with coastline awareness
      const bufferedWaterways: Feature<Polygon | MultiPolygon>[] = [];
      for (const waterway of waterwayFeatures) {
        try {
          const props = waterway.properties || {};
          const name = (props.name || '').toLowerCase();
          
          // Determine buffer size based on waterway type
          let bufferDistance = 0.01; // Default ~10 meters
          
          if (name.includes('river') || props.waterway === 'river') {
            bufferDistance = 0.02; // ~20 meters for rivers
          } else if (name.includes('canal') || props.waterway === 'canal') {
            bufferDistance = 0.015; // ~15 meters for canals  
          } else if (name.includes('stream') || name.includes('creek') || 
                     props.waterway === 'stream' || props.waterway === 'creek') {
            bufferDistance = 0.005; // ~5 meters for streams/creeks
          }

          // Buffer the linestring to create a polygon
          let buffered = turf.buffer(waterway, bufferDistance, { units: 'kilometers' });
          
          if (buffered && buffered.geometry.type === 'Polygon') {
            // Clip buffered waterway against land mask to prevent land overlap
            if (landMask) {
              try {
                const clipped = turf.difference(
                  turf.feature(buffered.geometry),
                  turf.feature(landMask.geometry)
                );
                if (clipped && (clipped.geometry.type === 'Polygon' || clipped.geometry.type === 'MultiPolygon')) {
                  buffered = clipped as Feature<Polygon>;
                } else {
                  // If clipping results in no geometry, skip this waterway
                  console.log('Waterway completely clipped by land, skipping');
                  continue;
                }
              } catch (clipErr) {
                console.warn('Failed to clip waterway against land, using original buffer:', clipErr);
                // Use original buffered waterway if clipping fails
              }
            }

            bufferedWaterways.push({
              ...buffered,
              properties: {
                ...props,
                buffered: true,
                originalType: 'waterway',
                clipped: landMask ? true : false
              }
            } as Feature<Polygon | MultiPolygon>);
          }
        } catch (err) {
          console.warn('Failed to buffer waterway:', err);
          // Skip this waterway if buffering fails
        }
      }

      console.log(`Successfully buffered ${bufferedWaterways.length} waterways ${landMask ? 'with coastline clipping' : 'without clipping'}`);

      // Combine water bodies and buffered waterways
      const allWaterFeatures: Feature<Polygon | MultiPolygon>[] = [...waterBodyFeatures, ...bufferedWaterways];

      // Remove duplicate water features by location
      const uniqueWaterFeatures: Feature<Polygon | MultiPolygon>[] = [];
      const seenLocations = new Set<string>();
      
      for (const feature of allWaterFeatures) {
        try {
          const centroid = turf.centroid(feature);
          const [lng, lat] = centroid.geometry.coordinates;
          const locationKey = `${Math.round(lng * 10000)}-${Math.round(lat * 10000)}`;
          
          if (!seenLocations.has(locationKey)) {
            seenLocations.add(locationKey);
            uniqueWaterFeatures.push(feature);
          }
        } catch (err) {
          // If centroid fails, keep the feature anyway
          uniqueWaterFeatures.push(feature);
        }
      }

      // Parks detection
      const parkFeatures = geoData.features.filter((feature): feature is Feature<Polygon | MultiPolygon> => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.leisure === 'park' || 
          props.leisure === 'garden' ||
          props.leisure === 'cemetery' ||
          name.includes('park') ||
          name.includes('cemetery')
        );
      });

      console.log(`Final: ${uniqueWaterFeatures.length} unique water features (${bufferedWaterways.length} buffered waterways), ${parkFeatures.length} park features`);

      // Add to map if it exists and is loaded
      if (map && mapLoaded) {
        // Add water (single layer to prevent overlaps)
        if (uniqueWaterFeatures.length > 0) {
          const waterCollection: FeatureCollection = { 
            type: 'FeatureCollection', 
            features: uniqueWaterFeatures 
          };
          
          if (map.getSource('simple-water')) {
            (map.getSource('simple-water') as maplibregl.GeoJSONSource).setData(waterCollection as any);
          } else {
            map.addSource('simple-water', { type: 'geojson', data: waterCollection });
            map.addLayer({
              id: 'water-simple',
              type: 'fill',
              source: 'simple-water',
              paint: {
                'fill-color': [
                  'case',
                  ['==', ['get', 'originalType'], 'waterway'],
                  '#5BA4E8', // Slightly different color for buffered waterways
                  '#4A90E2'  // Original water body color
                ],
                'fill-opacity': [
                  'case',
                  ['==', ['get', 'originalType'], 'waterway'],
                  0.7, // Slightly more transparent for buffered waterways
                  0.8  // Original opacity for water bodies
                ]
              }
            });
          }
        }

        // Add parks
        if (parkFeatures.length > 0) {
          const parksCollection: FeatureCollection = { 
            type: 'FeatureCollection', 
            features: parkFeatures 
          };
          
          if (map.getSource('simple-parks')) {
            (map.getSource('simple-parks') as maplibregl.GeoJSONSource).setData(parksCollection as any);
          } else {
            map.addSource('simple-parks', { type: 'geojson', data: parksCollection });
            map.addLayer({
              id: 'parks-simple',
              type: 'fill',
              source: 'simple-parks',
              paint: {
                'fill-color': '#4CAF50',
                'fill-opacity': 0.6
              }
            }, 'water-simple'); // Insert before water so water shows on top
          }
        }

        // Ensure businesses stay on top
        if (map.getLayer('businesses-layer')) {
          map.moveLayer('businesses-layer');
        }
      }

    } catch (error) {
      console.error('Error processing features:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, isProcessing]);

  const loadGeographicData = useCallback(async () => {
    try {
      // Load roads with timeout
      const roadsPromise = fetch('/data/merged_roads.geojson.gz')
        .then(response => response.ok ? response.json() : null)
        .catch(error => {
          console.warn('Failed to load roads:', error);
          return null;
        });

      // Load main data with timeout  
      const mainDataPromise = loadGeoJSONData();

      // Set timeout for both operations
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data loading timeout')), 10000)
      );

      const [roadsResult, mainDataResult] = await Promise.race([
        Promise.all([roadsPromise, mainDataPromise]),
        timeoutPromise
      ]) as [any, FeatureCollection | null];

      if (roadsResult) {
        setRoadsData(roadsResult);
      }

      if (mainDataResult && mainDataResult.features.length > 0) {
        // Process features in small batches to prevent blocking
        setTimeout(() => processSimpleFeatures(mainDataResult), 100);
      }

    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, processSimpleFeatures]);

  // Initialize map with minimal style
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = () => {
      try {
        const baseStyle = {
          version: 8 as const,
          sources: {},
          layers: [{
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#F5F5DC' }
          }]
        };

        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: baseStyle,
          center: [-73.9712, 40.7831],
          zoom: 12,
          maxZoom: 18,
          minZoom: 8
        });

        mapInstance.setMaxBounds([[-74.25909, 40.477399], [-73.700272, 40.917577]]);

        mapInstance.on('load', () => {
          if (cleanedUp) return;
          console.log('Map loaded successfully');
          setMapLoaded(true);
        });

        mapInstance.on('error', e => {
          console.error('Map error:', e.error);
        });

        setMap(mapInstance);

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        }
      }
      setMap(null);
      setMapLoaded(false);
    };
  }, []);

  // Load data after map loads
  useEffect(() => {
    if (mapLoaded && map && !isProcessing) {
      const timeoutId = setTimeout(() => {
        loadGeographicData();
      }, 500); // Small delay to ensure map is fully ready

      return () => clearTimeout(timeoutId);
    }
  }, [mapLoaded, map, loadGeographicData, isProcessing]);

  // Add roads layer
  useEffect(() => {
    if (!mapLoaded || !map || !roadsData) return;

    try {
      if (map.getSource('roads')) {
        (map.getSource('roads') as maplibregl.GeoJSONSource).setData(roadsData as any);
      } else {
        map.addSource('roads', { type: 'geojson', data: roadsData });
        map.addLayer({
          id: 'roads-layer',
          type: 'line',
          source: 'roads',
          paint: {
            'line-color': '#666666',
            'line-width': 1
          }
        });
      }
    } catch (error) {
      console.error('Error adding roads:', error);
    }
  }, [mapLoaded, map, roadsData]);

  // Business markers - simplified
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) return;

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
  }, [mapLoaded, businesses, onBusinessClick, map, selectedBusiness]);

  return (
    <div>
      {isProcessing && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '5px 10px',
          borderRadius: '4px',
          zIndex: 1000,
          fontSize: '12px'
        }}>
          Loading map data...
        </div>
      )}
      <div
        ref={mapRef}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      />
    </div>
  );
};

export default MapLibreMap;