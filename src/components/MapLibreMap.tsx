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

  // Simplified feature processing - only process what we need
  const processSimpleFeatures = useCallback(async (geoData: FeatureCollection) => {
    if (isProcessing) return; // Prevent multiple processing
    setIsProcessing(true);

    try {
      console.log(`Processing ${geoData.features.length} features...`);

      // Simple water detection with deduplication
      const waterFeatures = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        // Exclude parks and Jamaica Bay areas from being classified as water
        if (name.includes('park') || name.includes('jamaica bay unit') || name.includes('jamaica bay wildlife refuge')) return false;
        
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

      // Remove duplicate water features by location
      const uniqueWaterFeatures = [];
      const seenLocations = new Set();
      
      for (const feature of waterFeatures) {
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

      // Simple parks detection
      const parkFeatures = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        // Exclude Jamaica Bay Reserve
        if (name.includes('jamaica bay reserve')) return false;
        
        return (
          props.leisure === 'park' || 
          props.leisure === 'garden' ||
          props.leisure === 'cemetery' ||
          name.includes('park') ||
          name.includes('cemetery')
        );
      });

      console.log(`Found ${uniqueWaterFeatures.length} unique water features, ${parkFeatures.length} park features`);

      // Add to map if it exists and is loaded
      if (map && mapLoaded) {
        // Add water (single layer to prevent overlaps)
        if (uniqueWaterFeatures.length > 0) {
          const waterCollection = { type: 'FeatureCollection' as const, features: uniqueWaterFeatures };
          
          if (map.getSource('simple-water')) {
            (map.getSource('simple-water') as maplibregl.GeoJSONSource).setData(waterCollection as any);
          } else {
            map.addSource('simple-water', { type: 'geojson', data: waterCollection });
            map.addLayer({
              id: 'water-simple',
              type: 'fill',
              source: 'simple-water',
              paint: {
                'fill-color': '#4A90E2',
                'fill-opacity': 0.8  // Higher opacity since no overlaps
              }
            });
          }
        }

        // Add parks
        if (parkFeatures.length > 0) {
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
                'fill-color': '#4CAF50',
                'fill-opacity': 0.6
              }
            }, 'water-simple'); // Insert before water so water shows on top
          }
        }

        // Add park labels - only for specific parks, excluding Jamaica Bay Reserve
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
            
            if (map.getSource('park-labels')) {
              (map.getSource('park-labels') as maplibregl.GeoJSONSource).setData(labelsCollection as any);
            } else {
              map.addSource('park-labels', { type: 'geojson', data: labelsCollection });
              map.addLayer({
                id: 'park-labels-layer',
                type: 'symbol',
                source: 'park-labels',
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
                    '#2E7D1E', // Darker green for Pelham Bay Park
                    '#1B5E20'  // Standard dark green for other parks
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
      console.error('Error processing features:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, isProcessing]);

  const loadGeographicData = useCallback(async () => {
    try {
      // Load roads with proper gzip decompression
      const roadsPromise = fetch('/data/merged_roads.geojson.gz')
        .then(async response => {
          if (!response.ok) return null;
          
          // Check if the response is gzipped and handle accordingly
          const contentEncoding = response.headers.get('content-encoding');
          console.log('Roads response headers:', {
            contentType: response.headers.get('content-type'),
            contentEncoding: contentEncoding
          });
          
          try {
            // Try to parse as JSON directly first
            const data = await response.json();
            console.log('Successfully loaded roads data');
            return data;
          } catch (jsonError) {
            console.warn('Direct JSON parsing failed, trying as text:', jsonError);
            
            // Fallback: try to get as text and parse
            try {
              const text = await response.text();
              return JSON.parse(text);
            } catch (textError) {
              console.warn('Failed to parse roads JSON:', textError);
              return null;
            }
          }
        })
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