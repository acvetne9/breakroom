import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PMTiles, Protocol } from 'pmtiles';
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

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      console.log('MapLibreMap: initializing map with PMTiles protocol');

      // Register PMTiles protocol
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);

      console.log('PMTiles protocol registered');

      const mapStyle = {
        version: 8 as const,
        sources: {
          'nyc': {
            type: 'vector' as const,
            url: 'pmtiles://data/nyc.mbtiles'
          }
        },
        layers: [
          {
            id: 'water',
            type: 'fill' as const,
            source: 'nyc',
            'source-layer': 'water',
            paint: {
              'fill-color': '#74ccf4'
            }
          },
          {
            id: 'buildings',
            type: 'fill' as const,
            source: 'nyc',
            'source-layer': 'building',
            paint: {
              'fill-color': '#e6e6e6',
              'fill-outline-color': '#d4d4d4'
            }
          },
          {
            id: 'roads',
            type: 'line' as const,
            source: 'nyc',
            'source-layer': 'roads',
            paint: {
              'line-color': '#888',
              'line-width': 1
            }
          }
        ]
      };

      console.log('MapLibreMap: creating map instance...');
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: mapStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 8
      });
      console.log('MapLibreMap: map instance created successfully');

      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

      mapInstance.on('load', () => {
        if (cleanedUp) return;
        console.log('*** MAP LOAD EVENT FIRED ***');
        console.log('Map loaded successfully with PMTiles');
        
        console.log('Setting mapLoaded to true...');
        setMapLoaded(true);
        console.log('mapLoaded state updated');
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
  }, []);

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