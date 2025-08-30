import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useIsMobile } from '../hooks/use-mobile';
import { 
  extractParkFeatures, 
  extractWaterFeatures, 
  extractRoadFeatures, 
  extractWaterwayFeatures 
} from '../utils/featureProcessing';
import {
  addLandLayer,
  addParksLayer,
  addWaterLayer,
  addWaterwaysLayer,
  addRoadsLayer,
  addRoadsLayerChunked,
  addBusinessesLayer,
  ensureLayerOrder
} from '../utils/mapLayers';

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
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const { isProcessing, setIsProcessing, loadAllDataCenterOut, allDataLoaded } = useViewportMapData();
  const lastLoadedBoundsRef = useRef<string | null>(null);
  const processedRef = useRef(false);

  const processMapFeatures = useCallback(async () => {
    // Prevent duplicate processing across re-mounts (StrictMode/dev or crashes)
    const alreadyGlobalProcessed = (window as any).__MAP_FEATURES_PROCESSED__ === true;
    if (processedRef.current || alreadyGlobalProcessed || isProcessing) {
      console.log('🚫 Map features already processed or processing. Skipping.');
      return;
    }
    if (!map || !mapLoaded) {
      console.log(`🚫 Skipping map processing - map: ${!!map}, mapLoaded: ${mapLoaded}`);
      return;
    }
    
    console.log(`🗺️ Loading map data with vector tiles...`);
    processedRef.current = true; // prevent duplicate runs in this mount
    (window as any).__MAP_FEATURES_PROCESSED__ = true; // prevent duplicate runs across mounts
    setIsProcessing(true);
    
    try {
      // Load land layer first (still using GeoJSON for land)
      try {
        const landResponse = await fetch('/data/nyc_land.geojson');
        const landData = await landResponse.json();
        if (landData) {
          console.log(`🏞️ Adding land layer...`);
          addLandLayer(map, landData);
          console.log('✅ Land layer added');
        }
      } catch (error) {
        console.log('⚠️ No land data available - this will cause visibility issues!');
      }

      // Add vector tile source
      const tilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
      console.log('🧭 Using tiles URL:', tilesUrl);
      
      if (!map.getSource('nyc-tiles')) {
        map.addSource('nyc-tiles', {
          type: 'vector',
          tiles: [tilesUrl],
          minzoom: 8,
          maxzoom: 16
        });
        console.log('✅ Added vector tile source');
      }

      // Wait for source to load and probe for layer names
      const maxAttempts = 10;
      let attempt = 0;
      let sourceLayerName = null;
      
      while (attempt < maxAttempts && !sourceLayerName) {
        attempt++;
        const delay = Math.min(200 * attempt, 1000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const features = map.querySourceFeatures('nyc-tiles');
        console.log(`🔍 Query attempt ${attempt} (${delay}ms delay): ${features.length} features`);
        
        if (features.length > 0) {
          const uniqueLayers = new Set(features.map(f => (f as any).sourceLayer).filter(Boolean));
          console.log('🎯 Found source layers:', Array.from(uniqueLayers));
          
          // Try to find a suitable layer name
          const layerCandidates = ['examplepoints', 'default', 'features'];
          for (const candidate of layerCandidates) {
            if (uniqueLayers.has(candidate)) {
              sourceLayerName = candidate;
              break;
            }
          }
          
          // If no known candidate, use the first available layer
          if (!sourceLayerName && uniqueLayers.size > 0) {
            sourceLayerName = Array.from(uniqueLayers)[0];
          }
          
          if (sourceLayerName) {
            console.log(`🧭 Using source layer: ${sourceLayerName}`);
            break;
          }
        }
      }

      if (sourceLayerName) {
        // Add vector tile layers with proper styling
        console.log('🎨 Adding vector tile layers...');
        
        // Add parks layer
        if (!map.getLayer('parks-vector')) {
          map.addLayer({
            id: 'parks-vector',
            type: 'fill',
            source: 'nyc-tiles',
            'source-layer': sourceLayerName,
            filter: ['in', ['get', 'leisure'], ['literal', ['park', 'garden', 'playground', 'recreation_ground']]],
            paint: {
              'fill-color': '#87C17A', // Same green as GeoJSON version
              'fill-opacity': 1.0
            }
          });
          console.log('✅ Added parks vector layer');
        }

        // Add water layer
        if (!map.getLayer('water-vector')) {
          map.addLayer({
            id: 'water-vector',
            type: 'fill',
            source: 'nyc-tiles',
            'source-layer': sourceLayerName,
            filter: ['in', ['get', 'natural'], ['literal', ['water', 'bay', 'lake']]],
            paint: {
              'fill-color': '#6CA4E1', // Same blue as GeoJSON version
              'fill-opacity': 1.0
            }
          });
          console.log('✅ Added water vector layer');
        }

        // Add roads layer
        if (!map.getLayer('roads-vector')) {
          map.addLayer({
            id: 'roads-vector',
            type: 'line',
            source: 'nyc-tiles',
            'source-layer': sourceLayerName,
            filter: ['has', 'highway'],
            paint: {
              'line-color': '#666666', // Same gray as GeoJSON version
              'line-width': 2
            }
          });
          console.log('✅ Added roads vector layer');
        }

        // Ensure proper layer ordering
        const layers = ['parks-vector', 'water-vector', 'roads-vector'];
        layers.forEach(layerId => {
          if (map.getLayer(layerId)) {
            map.moveLayer(layerId);
          }
        });
        
        console.log('✅ Vector tile layers added and ordered');
        
        // Log current map layers
        const mapLayers = map.getStyle().layers || [];
        console.log('🗺️ Current map layers:', mapLayers.map(l => `${l.id} (${l.type})`));
        
      } else {
        console.log('⚠️ Could not determine source layer name from vector tiles');
      }
      
      console.log('🎉 Map processing completed successfully');
    } catch (error) {
      console.error('❌ Error processing map features:', error);
      // On error, reset flags so user can retry
      processedRef.current = false;
      (window as any).__MAP_FEATURES_PROCESSED__ = false;
    } finally {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, isMobile]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      console.error('Map container not found');
      return;
    }

    // DEBUG: Check container dimensions and visibility
    const container = mapRef.current;
    const computedStyle = window.getComputedStyle(container);
    const rect = container.getBoundingClientRect();
    
    console.log('Map container debug info:', {
      width: rect.width,
      height: rect.height,
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity,
      zIndex: computedStyle.zIndex,
      position: computedStyle.position,
      top: computedStyle.top,
      left: computedStyle.left,
      transform: computedStyle.transform
    });

    if (rect.width === 0 || rect.height === 0) {
      console.error('Map container has zero dimensions!', { width: rect.width, height: rect.height });
    }

    console.log('Initializing map with container:', mapRef.current);
    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const baseStyle = {
      version: 8 as const,
      sources: {},
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      layers: [{
        id: 'background',
        type: 'background' as const,
        paint: { 'background-color': '#B3E5FC' }
      }]
    };

    try {
      console.log('Creating MapLibre instance...');
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 8,
        renderWorldCopies: false,
        attributionControl: false
      });
      console.log('MapLibre instance created:', mapInstance);
      
      // Set bounds immediately after creation
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('🗺️ Map loaded and visible - blue background should be showing');
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

    setMap(mapInstance);

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

  // Load map data after initialization (only once)
  useEffect(() => {
    console.log(`🎯 Map data loading effect triggered - mapLoaded: ${mapLoaded}, map: ${!!map}, isProcessing: ${isProcessing}, processed: ${processedRef.current}`);
    
    if (mapLoaded && map && !isProcessing && !processedRef.current) {
      console.log('⏰ Calling processMapFeatures immediately');
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]); // Only depend on map, mapLoaded, and the callback

  // Remove viewport change loading since we load everything at once

  // Handle business markers
  useEffect(() => {
    if (!mapLoaded || !businesses || !map) return;

    const cleanup = addBusinessesLayer(map, businesses, selectedBusiness, onBusinessClick);
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
      let updateEmojiSize: (() => void) | null = null;
      updateEmojiSize = () => {
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
          zIndex: '0',
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

      // Cleanup on unmount or landmarks change
      return () => {
        landmarkMarkersRef.current.forEach(m => m.remove());
        landmarkMarkersRef.current = [];
        if (updateEmojiSize) map.off('zoom', updateEmojiSize);
      };
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
  }, [mapLoaded, landmarks, map]);

  return (
    <div
      ref={mapRef}
      style={{ 
        position: 'absolute', 
        top: 0, 
        bottom: 0, 
        left: 0, 
        right: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        backgroundColor: '#B3E5FC' // Light blue fallback while map loads
      }}
    />
  );
};

export default MapLibreMap;