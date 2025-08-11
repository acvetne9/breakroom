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
  const [isProcessing, setIsProcessing] = useState(false);
  const [coastlineData, setCoastlineData] = useState<FeatureCollection | null>(null);

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

  // Buffer waterway lines until they hit coastline
  const bufferWaterwayToCoastline = useCallback((
    waterway: Feature<LineString>, 
    coastlines: Feature[]
  ): Feature<Polygon | MultiPolygon> | null => {
    try {
      const maxBufferDistance = 2000; // 2km max buffer in meters
      const bufferSteps = [10, 25, 50, 100, 200, 500, 1000, 2000]; // Progressive buffer sizes in meters
      
      let currentBuffer = null;
      
      for (const bufferSize of bufferSteps) {
        try {
          // Create buffer around waterway
          const buffered = turf.buffer(waterway, bufferSize, { units: 'meters' });
          
          if (!buffered) continue;
          
          // Check if buffer intersects with any coastline
          let intersectsCoastline = false;
          
          for (const coastline of coastlines) {
            if (coastline.geometry.type === 'LineString') {
              try {
                if (turf.booleanIntersects(buffered, coastline)) {
                  intersectsCoastline = true;
                  break;
                }
              } catch (err) {
                // Continue if intersection check fails
                continue;
              }
            }
          }
          
          currentBuffer = buffered;
          
          // If we hit coastline, use previous buffer or clip to coastline
          if (intersectsCoastline) {
            break;
          }
          
          // Don't go beyond reasonable size for water bodies
          if (bufferSize >= maxBufferDistance) {
            break;
          }
        } catch (err) {
          console.warn(`Buffer failed at ${bufferSize}m:`, err);
          continue;
        }
      }
      
      return currentBuffer;
    } catch (error) {
      console.error('Error buffering waterway:', error);
      return null;
    }
  }, []);

  // Enhanced feature processing with waterway buffering
  const processWaterFeatures = useCallback(async (geoData: FeatureCollection) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      console.log(`Processing ${geoData.features.length} features for water...`);

      // Extract coastlines first for buffering reference
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' && 
        feature.properties?.natural === 'coastline'
      );

      // Process water polygons (existing functionality)
      const existingWaterPolygons = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        // Exclude parks from being classified as water
        if (name.includes('park') && !name.includes('water')) return false;
        
        return (
          props.natural === 'water' || 
          props.natural === 'bay' || 
          props.waterway === 'riverbank' ||
          props.water ||
          // Named water bodies
          ['river', 'bay', 'harbor', 'sound', 'creek', 'canal', 'reach', 'kill'].some(waterType => 
            name.includes(waterType)
          )
        );
      });

      // Process waterway lines that need buffering
      const waterwayLines = geoData.features.filter(feature => {
        if (feature.geometry.type !== 'LineString') return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.waterway && 
          props.waterway !== 'riverbank' && // Skip riverbanks as they're already polygons
          (
            // Major waterways
            ['river', 'stream', 'canal', 'tidal_channel', 'channel'].includes(props.waterway) ||
            // Named waterways that sound like major water bodies
            ['bay', 'sound', 'harbor', 'reach', 'kill', 'river', 'creek'].some(waterType => 
              name.includes(waterType)
            )
          )
        );
      });

      console.log(`Found ${waterwayLines.length} waterway lines to buffer, ${existingWaterPolygons.length} existing water polygons`);

      // Buffer waterway lines
      const bufferedWaterways: Feature[] = [];
      for (const waterway of waterwayLines) {
        if (waterway.geometry.type === 'LineString') {
          const buffered = bufferWaterwayToCoastline(waterway as Feature<LineString>, coastlines);
          if (buffered) {
            // Preserve original properties
            buffered.properties = {
              ...waterway.properties,
              buffered: true,
              original_waterway: waterway.properties?.waterway
            };
            bufferedWaterways.push(buffered);
          }
        }
      }

      console.log(`Successfully buffered ${bufferedWaterways.length} waterways`);

      // Combine existing water polygons with buffered waterways
      const allWaterFeatures = [...existingWaterPolygons, ...bufferedWaterways];

      // Remove duplicate water features by location (existing logic)
      const uniqueWaterFeatures = [];
      const seenLocations = new Set();
      
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

      // Process parks (existing functionality)
      const parkFeatures = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        return (
          props.leisure === 'park' || 
          props.leisure === 'garden' ||
          props.leisure === 'cemetery' ||
          props.landuse === 'cemetery' ||
          props.amenity === 'grave_yard' ||
          (name.includes('park') && !name.includes('water')) ||
          name.includes('cemetery')
        );
      });

      console.log(`Final result: ${uniqueWaterFeatures.length} water features (${bufferedWaterways.length} buffered), ${parkFeatures.length} parks`);

      // Add to map if it exists and is loaded
      if (map && mapLoaded) {
        // Add water features
        if (uniqueWaterFeatures.length > 0) {
          const waterCollection = { type: 'FeatureCollection' as const, features: uniqueWaterFeatures };
          
          if (map.getSource('enhanced-water')) {
            (map.getSource('enhanced-water') as maplibregl.GeoJSONSource).setData(waterCollection as any);
          } else {
            map.addSource('enhanced-water', { type: 'geojson', data: waterCollection });
            map.addLayer({
              id: 'water-enhanced',
              type: 'fill',
              source: 'enhanced-water',
              paint: {
                'fill-color': [
                  'case',
                  ['get', 'buffered'],
                  '#2196F3', // Slightly different blue for buffered waterways
                  '#4A90E2'  // Original blue for existing water polygons
                ],
                'fill-opacity': [
                  'case',
                  ['get', 'buffered'],
                  0.7,  // Slightly more transparent for buffered areas
                  0.8   // Standard opacity for existing water
                ]
              }
            });

            // Add subtle stroke for buffered waterways
            map.addLayer({
              id: 'water-enhanced-stroke',
              type: 'line',
              source: 'enhanced-water',
              filter: ['==', ['get', 'buffered'], true],
              paint: {
                'line-color': '#1976D2',
                'line-width': 1,
                'line-opacity': 0.6
              }
            });
          }
        }

        // Add parks (existing functionality)
        if (parkFeatures.length > 0) {
          const parksCollection = { type: 'FeatureCollection' as const, features: parkFeatures };
          
          if (map.getSource('enhanced-parks')) {
            (map.getSource('enhanced-parks') as maplibregl.GeoJSONSource).setData(parksCollection as any);
          } else {
            map.addSource('enhanced-parks', { type: 'geojson', data: parksCollection });
            map.addLayer({
              id: 'parks-enhanced',
              type: 'fill',
              source: 'enhanced-parks',
              paint: {
                'fill-color': '#4CAF50',
                'fill-opacity': 0.6
              }
            }, 'water-enhanced'); // Insert before water so water shows on top
          }
        }

        // Add park labels (existing functionality)
        if (parkFeatures.length > 0) {
          const labelFeatures = parkFeatures
            .filter(feature => {
              const name = feature.properties?.name || '';
              return name && !name.toLowerCase().includes('jamaica bay reserve');
            })
            .map(feature => {
              try {
                const centroid = turf.centroid(feature);
                return {
                  type: 'Feature' as const,
                  geometry: centroid.geometry,
                  properties: { 
                    name: feature.properties?.name || '',
                    isPelhamBayPark: feature.properties?.name === 'Pelham Bay Park'
                  }
                };
              } catch (err) {
                return null;
              }
            })
            .filter(Boolean);

          if (labelFeatures.length > 0) {
            const labelsCollection = { type: 'FeatureCollection' as const, features: labelFeatures };
            
            if (map.getSource('enhanced-park-labels')) {
              (map.getSource('enhanced-park-labels') as maplibregl.GeoJSONSource).setData(labelsCollection as any);
            } else {
              map.addSource('enhanced-park-labels', { type: 'geojson', data: labelsCollection });
              map.addLayer({
                id: 'park-labels-enhanced',
                type: 'symbol',
                source: 'enhanced-park-labels',
                layout: {
                  'text-field': ['get', 'name'],
                  'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  'text-size': 12,
                  'text-anchor': 'center',
                  'text-allow-overlap': false,
                  'text-ignore-placement': false
                },
                paint: {
                  'text-color': [
                    'case',
                    ['get', 'isPelhamBayPark'],
                    '#2E7D1E',
                    '#1B5E20'
                  ],
                  'text-halo-color': '#FFFFFF',
                  'text-halo-width': 1
                }
              });
            }
          }
        }

        // Ensure businesses stay on top
        if (map.getLayer('businesses-layer')) {
          map.moveLayer('businesses-layer');
        }
      }

    } catch (error) {
      console.error('Error processing water features:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, isProcessing, bufferWaterwayToCoastline]);

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
        setTimeout(() => reject(new Error('Data loading timeout')), 15000) // Increased timeout for processing
      );

      const [roadsResult, mainDataResult] = await Promise.race([
        Promise.all([roadsPromise, mainDataPromise]),
        timeoutPromise
      ]) as [any, FeatureCollection | null];

      if (roadsResult) {
        setRoadsData(roadsResult);
      }

      if (mainDataResult && mainDataResult.features.length > 0) {
        // Store coastline data for waterway buffering
        const coastlines = mainDataResult.features.filter(feature => 
          feature.geometry.type === 'LineString' && 
          feature.properties?.natural === 'coastline'
        );
        if (coastlines.length > 0) {
          setCoastlineData({ type: 'FeatureCollection', features: coastlines });
        }

        // Process features with enhanced water handling
        setTimeout(() => processWaterFeatures(mainDataResult), 100);
      }

    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, processWaterFeatures]);

  // Initialize map with minimal style (unchanged)
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

  // Load data after map loads (unchanged)
  useEffect(() => {
    if (mapLoaded && map && !isProcessing) {
      const timeoutId = setTimeout(() => {
        loadGeographicData();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [mapLoaded, map, loadGeographicData, isProcessing]);

  // Add roads layer (unchanged)
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

  // Business markers (unchanged)
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
          Processing waterways...
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