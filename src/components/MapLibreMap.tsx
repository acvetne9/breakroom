import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportMapData } from '../hooks/useViewportMapData';
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
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const { isProcessing, setIsProcessing, loadViewportData } = useViewportMapData();
  const lastLoadedBoundsRef = useRef<string | null>(null);

  const processMapFeatures = useCallback(async () => {
    if (!map || !mapLoaded || isProcessing) return;
    
    const bounds = map.getBounds();
    const viewportBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };

    // Create a bounds key to avoid redundant loads
    const boundsKey = `${viewportBounds.north.toFixed(4)}-${viewportBounds.south.toFixed(4)}-${viewportBounds.east.toFixed(4)}-${viewportBounds.west.toFixed(4)}`;
    if (lastLoadedBoundsRef.current === boundsKey) {
      return; // Already loaded this viewport
    }

    console.log('Loading data for viewport:', viewportBounds);
    setIsProcessing(true);
    
    try {
      const { features, landData } = await loadViewportData(viewportBounds);
      lastLoadedBoundsRef.current = boundsKey;

      // Add land layer first
      if (landData) {
        addLandLayer(map, landData);
      }

      if (features?.length) {
        // Create feature collection for processing
        const mainData = {
          type: 'FeatureCollection' as const,
          features
        };

        // Extract features
        const parkFeatures = extractParkFeatures(mainData);
        const parkFeatureIds = new Set(parkFeatures.map(f => f.properties?.id || f.id).filter(Boolean));
        const waterFeatures = extractWaterFeatures(mainData, parkFeatureIds);
        const roadFeatures = extractRoadFeatures(mainData);
        const waterwayFeatures = extractWaterwayFeatures(mainData);

        console.log(`Found ${parkFeatures.length} park features, ${waterFeatures.length} water features, ${roadFeatures.length} road features`);

        // Add layers in order: parks, water, waterways, roads
        addParksLayer(map, parkFeatures);
        addWaterLayer(map, waterFeatures);
        addWaterwaysLayer(map, waterwayFeatures);
        addRoadsLayer(map, roadFeatures);

        // Ensure proper layer ordering
        ensureLayerOrder(map);
      }
    } catch (error) {
      console.error('Error processing map features:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, isProcessing, loadViewportData, setIsProcessing]);

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
    } catch (error) {
      console.error('Error creating map instance:', error);
      return;
    }

    mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('Map loaded successfully');
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

  // Load map data after initialization and on viewport changes
  useEffect(() => {
    if (mapLoaded && map && !isProcessing) {
      const timeoutId = setTimeout(() => {
        processMapFeatures();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [mapLoaded, map, processMapFeatures, isProcessing]);

  // Load additional chunks when map moves
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const handleMoveEnd = () => {
      // Debounce the viewport data loading
      const timeoutId = setTimeout(() => {
        processMapFeatures();
      }, 300);
      return () => clearTimeout(timeoutId);
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, mapLoaded, processMapFeatures]);

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
      style={{ 
        position: 'absolute', 
        top: 0, 
        bottom: 0, 
        left: 0, 
        right: 0,
        width: '100%',
        height: '100%',
        zIndex: 1
      }}
    />
  );
};

export default MapLibreMap;