import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import { supabase } from '@/integrations/supabase/client';
import { addBusinessesLayer } from '../utils/mapLayers';

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
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [tilesUrl, setTilesUrl] = useState<string | null>(null);

  // Get Supabase Storage URL for nyc.mbtiles
  const getTilesUrl = useCallback(async () => {
    try {
      const { data } = await supabase.storage
        .from('nyc-map-storage-files')
        .getPublicUrl('nyc.mbtiles');
      
      if (data?.publicUrl) {
        console.log('Tiles URL:', data.publicUrl);
        setTilesUrl(data.publicUrl);
        return data.publicUrl;
      }
    } catch (error) {
      console.error('Error getting tiles URL:', error);
    }
    return null;
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      console.log('MapLibreMap: initializing map');
      // Add PMTiles protocol
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);

      // Get tiles URL from Supabase Storage
      const url = await getTilesUrl();
      if (!url) {
        console.error('Failed to get tiles URL');
        return;
      }

      const mapStyle = {
        version: 8 as const,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        sources: {
          nyc: {
            type: 'vector' as const,
            url: `pmtiles://${url}`
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#B3E5FC' }
          },
          {
            id: 'debug-points',
            type: 'circle' as const,
            source: 'nyc',
            'source-layer': 'polygon',
            paint: {
              'circle-color': '#F5F5DC',
              'circle-opacity': 0.9,
              'circle-stroke-color': '#cccccc',
              'circle-stroke-width': 0.5,
              'circle-radius': 2.5
            }
          },
          {
            id: 'parks',
            type: 'circle' as const,
            source: 'nyc',
            'source-layer': 'polygon',
            filter: ['==', ['get', 'leisure'], 'park'] as any,
            paint: {
              'circle-color': '#87C17A',
              'circle-opacity': 1.0,
              'circle-radius': 2.8
            }
          },
          {
            id: 'water',
            type: 'circle' as const,
            source: 'nyc',
            'source-layer': 'polygon',
            filter: ['any', 
              ['==', ['get', 'natural'], 'water'],
              ['==', ['get', 'water'], 'lake'],
              ['==', ['get', 'water'], 'pond'],
              ['==', ['get', 'water'], 'river']
            ] as any,
            paint: {
              'circle-color': '#6CA4E1',
              'circle-opacity': 1.0,
              'circle-radius': 2.8
            }
          },
          {
            id: 'roads',
            type: 'circle' as const,
            source: 'nyc',
            'source-layer': 'polygon',
            filter: ['has', 'highway'] as any,
            paint: {
              'circle-color': '#666666',
              'circle-opacity': 0.9,
              'circle-radius': 1.8
            }
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: mapStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 8
      });
      console.log('MapLibreMap: map instance created', { center: [-73.986104, 40.715245], zoom: 12.77 });

      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

      mapInstance.on('load', () => {
        if (cleanedUp) return;
        console.log('Map loaded successfully with PMTiles');
        
        // Log available source layers for debugging
        if (mapInstance.getSource('nyc')) {
          console.log('NYC vector source loaded');
        }
        
        setMapLoaded(true);
      });

      // Log current zoom and center when map moves
      mapInstance.on('moveend', () => {
        if (mapInstance) {
          const zoom = mapInstance.getZoom();
          const center = mapInstance.getCenter();
          console.log(`Current zoom: ${zoom.toFixed(2)} | Center: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
        }
      });

      mapInstance.on('error', e => {
        console.error('Map error:', e.error);
      });

      // Extra diagnostics for style/state
      mapInstance.on('styledata', () => {
        console.log('Style data event fired. Current style layers:', mapInstance.getStyle().layers?.map(l => l.id));
      });

      mapInstance.on('dataloading', (e: any) => {
        if (e?.dataType === 'source' && e?.sourceId === 'nyc') {
          console.log('Loading data for source nyc...', { tileID: e?.tile?.tileID, coord: e?.tile?.tileID?.canonical });
        }
      });

      mapInstance.on('data', (e: any) => {
        if (e?.dataType === 'source' && e?.sourceId === 'nyc') {
          console.log('Data event for source nyc. isSourceLoaded:', e?.isSourceLoaded);
        }
      });

      // Log source layer diagnostics
      mapInstance.on('sourcedata', (e) => {
        if (e.sourceId === 'nyc' && e.isSourceLoaded) {
          console.log('NYC vector tiles loaded');
          // Try to detect source layers by inspecting features
          const layers = ['polygon'];
          layers.forEach(layer => {
            try {
              const features = mapInstance.querySourceFeatures('nyc', { sourceLayer: layer });
              console.log(`Source layer '${layer}': ${features.length} features`);
              if (features.length > 0) {
                console.log('Sample feature properties:', features[0].properties);
              }
            } catch (err) {
              console.log(`Source layer '${layer}': not found or error`);
            }
          });
        }
      });

      mapInstance.on('idle', () => {
        try {
          const renderedAll = mapInstance.queryRenderedFeatures(undefined, { layers: ['debug-points'] });
          const renderedParks = mapInstance.queryRenderedFeatures(undefined, { layers: ['parks'] });
          const renderedWater = mapInstance.queryRenderedFeatures(undefined, { layers: ['water'] });
          const renderedRoads = mapInstance.queryRenderedFeatures(undefined, { layers: ['roads'] });
          console.log('Rendered feature counts:', {
            debug_points: renderedAll.length,
            parks: renderedParks.length,
            water: renderedWater.length,
            roads: renderedRoads.length,
          });
        } catch (err) {
          console.log('Error querying rendered features:', err);
        }
      });

      setMap(mapInstance);
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
  }, [getTilesUrl]);

  // No longer needed - vector tiles are loaded directly in map style

  // Handle business markers
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) {
      console.log('Businesses effect skipped', { mapLoaded, hasBusinesses: !!businesses, mapExists: !!map, count: businesses?.length });
      return;
    }

    console.log('Businesses effect running', { count: businesses.length, selectedBusinessId: selectedBusiness?.id });

    const cleanup = addBusinessesLayer(map, businesses, selectedBusiness, onBusinessClick);
    try {
      console.log('Post addBusinessesLayer. Has layer?', !!map.getLayer('businesses-layer'));
    } catch (e) {
      console.log('Error checking businesses-layer presence', e);
    }
    return cleanup;
  }, [mapLoaded, businesses, onBusinessClick, map, selectedBusiness]);

  // Handle landmark markers
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
        const scaleFactor = Math.pow(1.2, zoom - 10);
        const size = Math.max(12, Math.min(32, baseSize * scaleFactor));
        
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

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
        
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
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;