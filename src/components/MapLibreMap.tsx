import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
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
  landmarks?: { lat: number; lng: number; emoji: string }[];
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness,
  landmarks = []
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);

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

      // Process parks FIRST to prevent them from being classified as water
      const parkFeatures = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        // Exclude Jamaica Bay Reserve and Jamaica Bay Unit
        if (name.includes('jamaica bay reserve') || name.includes('jamaica bay unit')) return false;
        // Exclude specific Jamaica Bay Unit by ID
        if (props.id === 1232494364 || props.id === '1232494364') return false;
        
        return (
          props.leisure === 'park' || 
          props.leisure === 'garden' ||
          props.leisure === 'cemetery' ||
          props.leisure === 'nature_reserve' ||
          props.landuse === 'meadow' ||
          props.wetland === 'wet_meadow' ||
          name.includes('park') ||
          name.includes('cemetery')
        );
      });

      // Create set of park feature IDs to exclude from water processing
      const parkFeatureIds = new Set(parkFeatures.map(f => f.properties?.id || f.id).filter(Boolean));

      // Water detection - exclude features already classified as parks
      const waterFeatures = geoData.features.filter(feature => {
        if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return false;
        const props = feature.properties || {};
        const name = (props.name || '').toLowerCase();
        
        // Exclude if already classified as park
        if (parkFeatureIds.has(props?.id) || parkFeatureIds.has(feature.id)) return false;
        
        // Exclude parks, Jamaica Bay areas, waterways, and park-like features from being classified as water
        if (name.includes('park') || name.includes('jamaica bay unit') || name.includes('jamaica bay wildlife refuge') || props.waterway) return false;
        if (props.leisure === 'park' || props.leisure === 'garden' || props.leisure === 'cemetery' || props.leisure === 'nature_reserve') return false;
        if (props.landuse === 'meadow' || props.wetland === 'wet_meadow') return false;
        if (name.includes('cemetery')) return false;
        
        return (
          props.natural === 'water' || 
          props.natural === 'bay' || 
          // Named water bodies (but not waterways)
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

      console.log(`Found ${parkFeatures.length} park features, ${uniqueWaterFeatures.length} unique water features`);

      // Add to map if it exists and is loaded
      if (map && mapLoaded) {
        // Add parks FIRST (bottom layer)
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
                'fill-color': '#6EBD6C', // 80% green + 20% wheat
                'fill-opacity': 1.0
              }
            }); // Parks at bottom
          }
        }

        // Add water ABOVE parks but BELOW roads
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
                'fill-color': '#6CA4E1', // 80% water + 20% wheat
                'fill-opacity': 1.0
              }
            }, 'roads-layer'); // Add water below roads but above parks
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
      // Load main data with timeout  
      const mainDataPromise = loadGeoJSONData();

      // Load NYC land data
      const landPromise = fetch('/data/nyc_land.geojson')
        .then(async response => {
          if (!response.ok) return null;
          try {
            const data = await response.json();
            console.log('Successfully loaded NYC land data');
            return data;
          } catch (error) {
            console.warn('Failed to parse NYC land JSON:', error);
            return null;
          }
        })
        .catch(error => {
          console.warn('Failed to load NYC land:', error);
          return null;
        });

      // Set timeout for operations
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data loading timeout')), 10000)
      );

      const [mainDataResult, landResult] = await Promise.race([
        Promise.all([mainDataPromise, landPromise]),
        timeoutPromise
      ]) as [FeatureCollection | null, any];

      // Add NYC land layer first (wheat colored land)
      if (landResult && map && mapLoaded) {
        if (map.getSource('nyc-land')) {
          (map.getSource('nyc-land') as maplibregl.GeoJSONSource).setData(landResult);
        } else {
          map.addSource('nyc-land', { type: 'geojson', data: landResult });
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
      }

        // Extract roads from main data
        if (mainDataResult && mainDataResult.features.length > 0) {
          const roadFeatures = mainDataResult.features.filter(feature => {
            if (feature.geometry.type !== 'LineString') return false;
            const props = feature.properties || {};
            const name = (props.name || '').toLowerCase();
            
            // Only include features with highway property
            if (!props.highway) return false;
            
            // Exclude coastlines and waterways
            if (props.natural === 'coastline' || props.waterway) return false;
            
            // Exclude bikeways/cycleways from being styled as roads
            if (props.highway === 'cycleway' || props.highway === 'path' || props.bicycle === 'yes') return false;
            
            // Exclude New Jersey roads explicitly
            if (name.includes('new jersey') || 
                name.includes('nj ') || 
                name.includes('jersey') ||
                name.includes('hoboken') ||
                name.includes('weehawken') ||
                name.includes('union city') ||
                name.includes('palisades')) return false;
            
            return true;
          });

        if (roadFeatures.length > 0 && map && mapLoaded) {
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
            }); // Remove the before parameter
          }
          console.log(`Added ${roadFeatures.length} road features`);
        }

        // Add waterways as subtle uncolored lines (exclude coastlines)
        const waterwayFeatures = mainDataResult.features.filter(feature => {
          if (feature.geometry.type !== 'LineString') return false;
          const props = feature.properties || {};
          return props.waterway && props.natural !== 'coastline';
        });

        if (waterwayFeatures.length > 0 && map && mapLoaded) {
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
            }, 'roads-layer'); // Add before roads
          }
          console.log(`Added ${waterwayFeatures.length} waterway features`);
        }

        // Process other features in small batches to prevent blocking
        setTimeout(() => processSimpleFeatures(mainDataResult), 100);
      }

    } catch (error) {
      console.error('Error loading geographic data:', error);
    }
  }, [loadGeoJSONData, processSimpleFeatures, map, mapLoaded]);

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
          glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', // Add glyphs for text rendering
          layers: [{
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#B3E5FC' } // Water background
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

        mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

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

  // Emoji landmarks - render on top of everything using HTML markers (emoji-friendly)
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;

    console.log('Adding emoji landmarks:', landmarks);

    // Remove any previous markers
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    try {
      const updateEmojiSize = () => {
        const zoom = map.getZoom();
        const baseSize = 16;
        const scaleFactor = Math.pow(1.2, zoom - 10); // Scale relative to zoom level 10
        const size = Math.max(12, Math.min(32, baseSize * scaleFactor)); // Min 12px, max 32px
        
        landmarkMarkersRef.current.forEach(marker => {
          const element = marker.getElement();
          if (element) {
            element.style.fontSize = `${size}px`;
            element.style.lineHeight = `${size}px`;
            element.style.width = `${size}px`;
            element.style.height = `${size}px`;
          }
        });
      };

      const newMarkers: maplibregl.Marker[] = landmarks.map((landmark, index) => {
        console.log(`Creating marker ${index}:`, landmark);
        
        const zoom = map.getZoom();
        const baseSize = 16;
        const scaleFactor = Math.pow(1.2, zoom - 10);
        const size = Math.max(12, Math.min(32, baseSize * scaleFactor));
        
        const el = document.createElement('div');
        el.textContent = landmark.emoji;
        Object.assign(el.style, {
          fontSize: `${size}px`,
          lineHeight: `${size}px`,
          width: `${size}px`,
          height: `${size}px`,
          userSelect: 'none',
          pointerEvents: 'none',
          textShadow: '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)',
          zIndex: '1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        } as CSSStyleDeclaration);

        console.log('Created element:', el, 'with coordinates:', [landmark.lng, landmark.lat]);

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
        
        console.log('Added marker to map:', marker);
        return marker;
      });

      landmarkMarkersRef.current = newMarkers;
      
      // Add zoom listener to update emoji sizes
      map.on('zoom', updateEmojiSize);
      
      console.log(`Successfully added ${newMarkers.length} emoji markers`);
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }

    // Cleanup on unmount or landmarks change
    return () => {
      landmarkMarkersRef.current.forEach(m => m.remove());
      landmarkMarkersRef.current = [];
    };
  }, [mapLoaded, landmarks, map]);

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