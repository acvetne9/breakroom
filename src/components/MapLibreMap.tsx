import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';

import { useIsMobile } from '../hooks/use-mobile';
import { DeckGLOverlay } from './DeckGLOverlay';
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
  ensureLayerOrder
} from '../utils/mapLayers';

interface MapLibreMapProps {
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
  landmarks?: { lat: number; lng: number; emoji: string }[];
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = []
}) => {
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const { isProcessing, setIsProcessing, loadAllDataCenterOut } = useViewportMapData();
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clusterBusinesses 
  } = useViewportBusinesses();
  const processedRef = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(12);
  const layersAddedRef = useRef(false);

  // Enhanced business click handler with viewport integration
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('🎯 MapLibreMap handleBusinessClick called:', business.name);
    
    // Zoom to business first
    if (map) {
      map.easeTo({
        center: [business.position.lng, business.position.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 800
      });
    }
    
    // Fetch full details if needed
    if (!business.atmosphere?.length && !business.roles?.length) {
      const fullBusiness = await fetchFullBusinessDetails(business.id);
      if (fullBusiness && onBusinessClick) {
        onBusinessClick(fullBusiness);
      }
    } else if (onBusinessClick) {
      onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

  // Movement state tracking for better debouncing
  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable viewport change handler to prevent infinite re-renders
  const handleViewportChange = useCallback((isInitial: boolean = false) => {
    if (!map || !mapLoaded) return;

    try {
      const bounds = map.getBounds();
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };

      // Load businesses with appropriate limits
      const businessLimit = isMobile ? 12000 : 25000;
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      
      setCurrentZoom(zoom);
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile]); // Removed loadBusinessesInViewport to prevent re-renders

  const processMapFeatures = useCallback(async () => {
    // Prevent duplicate processing across re-mounts (StrictMode/dev or crashes)
    const alreadyGlobalProcessed = (window as any).__MAP_FEATURES_PROCESSED__ === true;
    if (processedRef.current || alreadyGlobalProcessed) {
      return;
    }
    if (!map || !mapLoaded) {
      return;
    }
    
    processedRef.current = true; // prevent duplicate runs in this mount
    (window as any).__MAP_FEATURES_PROCESSED__ = true; // prevent duplicate runs across mounts
    setIsProcessing(true);
    
    console.log('🎉 NYC .pbf vector tiles ready');
    setIsProcessing(false);
  }, []); // No dependencies to prevent infinite re-renders

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    // Handle tile URLs for different environments
    const isCapacitor = window.location.protocol === 'capacitor:';
    const absoluteTilesUrl = isCapacitor 
      ? `https://id-preview--8b6dea56-dc8e-4244-a645-44c92d10150b.lovable.app/data/tiles/{z}/{x}/{y}.pbf`
      : `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    
    console.log('🧭 Using tiles URL:', absoluteTilesUrl);
    console.log('📱 Is Capacitor environment:', isCapacitor);

    // Simplified style with no fonts to prevent crashes
    const baseStyle = {
      version: 8 as const,
      sources: {
        'nyc-tiles': {
          type: 'vector' as const,
          tiles: [absoluteTilesUrl],
          minzoom: 10,
          maxzoom: 16,
          scheme: 'xyz' as const
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background' as const,
          paint: { 'background-color': '#F5F5DC' }
        }
      ]
    };

    try {
      console.log('🗺️ Creating MapLibre instance...');
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
      
      console.log('🗺️ MapLibre instance created successfully');
      
      // Set bounds immediately after creation
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('❌ Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('🗺️ Map loaded successfully');
      setMapLoaded(true);
    });

    // Movement tracking only - business loading will be handled separately
    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    });

    mapInstance.on('error', e => {
      console.error('🚨 Map error:', e.error);
    });
    
    // Simple sourcedata handler without font-dependent layers
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        console.log('🎯 Source fully loaded, attempting to add basic layers...');
        
        try {
          // Only add simple layers without text/labels to avoid font issues
          if (!mapInstance.getLayer('roads')) {
            mapInstance.addLayer({
              id: 'roads',
              type: 'line',
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
              filter: ['has', 'name'],
              paint: {
                'line-color': '#666',
                'line-width': 2,
                'line-opacity': 0.8
              }
            });
          }
          
          if (!mapInstance.getLayer('water')) {
            mapInstance.addLayer({
              id: 'water',
              type: 'fill',
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
              filter: ['==', 'natural', 'water'],
              paint: {
                'fill-color': '#4A90E2',
                'fill-opacity': 0.6
              }
            });
          }
          
          console.log('✅ Basic layers added successfully');
          layersAddedRef.current = true;
          
        } catch (error) {
          console.warn('⚠️ Error adding layers:', error);
        }
      }
    });

    setMap(mapInstance);

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        } finally {
          layersAddedRef.current = false;
        }
      }
      setMap(null);
      setMapLoaded(false);
    };
  }, []);

  // Load map data after initialization (only once)
  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]);

  // Clean business loading setup - single effect with proper debouncing
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout | null = null;
    
    const moveEndHandler = () => {
      // Clear existing timeout
      if (moveTimeout) clearTimeout(moveTimeout);
      
      // Debounce viewport changes
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    // Single event listener for smooth performance
    map.on('moveend', moveEndHandler);
    
    // Initial load - only once when map is ready
    handleViewportChange(true);
    
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Handle old business layer removal and deck.gl integration
  useEffect(() => {
    if (!mapLoaded || !map) return;

    // Remove old businesses layer if it exists
    if (map.getLayer('businesses-layer')) {
      map.removeLayer('businesses-layer');
    }
    if (map.getSource('businesses')) {
      map.removeSource('businesses');
    }
  }, [mapLoaded, map]);

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
        backgroundColor: '#F5F5DC' // Fallback background color
      }}
    >
      {isProcessing && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
              <span>Loading map...</span>
            </div>
          </div>
        </div>
      )}
      
      {map && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
        />
      )}
    </div>
  );
};

export default MapLibreMap;