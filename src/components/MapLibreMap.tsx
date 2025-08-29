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
  businesses: propBusinesses, // Rename to avoid confusion with viewport businesses
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

  // Enhanced business click handler with viewport integration
  const handleBusinessClick = useCallback(async (business: any) => {
    // Fetch full details if needed
    if (!business.atmosphere?.length && !business.roles?.length) {
      const fullBusiness = await fetchFullBusinessDetails(business.id);
      if (fullBusiness && onBusinessClick) {
        onBusinessClick(fullBusiness);
      }
    } else if (onBusinessClick) {
      onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails, onBusinessClick]);

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

    const baseStyle = {
      version: 8 as const,
      sources: {
        'nyc-tiles': {
          type: 'vector' as const,
          tiles: ['/data/tiles/{z}/{x}/{y}.pbf'],
          minzoom: 10,
          maxzoom: 16
        }
      },
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#B3E5FC' }
          }
          // Removed hardcoded layers - will add dynamically based on actual tile content
        ]
    };

    try {
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
      
      // Set bounds immediately after creation
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('❌ Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('🗺️ Map loaded - starting tile debugging');
      
      // Immediate tile access test
      fetch('/data/tiles/12/1203/1536.pbf')
        .then(response => {
          console.log('🔍 Tile URL test:', response.status, response.ok ? '✅' : '❌');
          if (!response.ok) {
            console.error('🚨 Tiles are not accessible at /data/tiles/ - check if files exist');
          }
          return response.arrayBuffer();
        })
        .then(buffer => {
          console.log('🔍 Tile size:', buffer.byteLength, 'bytes');
        })
        .catch(error => {
          console.error('🚨 Tile access failed:', error);
        });
      
      // Add a catch-all layer to show ANY features in the tiles
      setTimeout(() => {
        try {
          // First check what source layers exist
          const sourceFeatures = mapInstance.querySourceFeatures('nyc-tiles');
          console.log('🔍 Source features found:', sourceFeatures.length);
          
          if (sourceFeatures.length > 0) {
            const sourceLayers = [...new Set(sourceFeatures.map(f => (f as any).sourceLayer))];
            console.log('🔍 Actual source layers in your tiles:', sourceLayers);
            
            const sampleFeature = sourceFeatures[0];
            console.log('🔍 Sample feature properties:', sampleFeature.properties);
            console.log('🔍 Sample geometry type:', sampleFeature.geometry?.type);
            
            // Add a catch-all layer for the first source layer found
            if (sourceLayers.length > 0) {
              const firstSourceLayer = sourceLayers[0];
              console.log('🔧 Adding catch-all layer for source:', firstSourceLayer);
              
              // Remove existing layers first
              const existingLayers = ['water-lines', 'park-lines', 'roads'];
              existingLayers.forEach(layerId => {
                if (mapInstance.getLayer(layerId)) {
                  mapInstance.removeLayer(layerId);
                }
              });
              
              // Add a simple circle layer that shows all features
              mapInstance.addLayer({
                id: 'debug-all-features',
                type: 'circle',
                source: 'nyc-tiles',
                'source-layer': firstSourceLayer,
                paint: {
                  'circle-radius': 3,
                  'circle-color': '#ff0000',
                  'circle-opacity': 0.8,
                  'circle-stroke-width': 1,
                  'circle-stroke-color': '#ffffff'
                }
              });
              
              console.log('✅ Added debug layer - you should now see red dots for all features');
            }
          } else {
            console.log('🚨 No features found in tiles - checking tile URL...');
          }
        } catch (error) {
          console.error('🚨 Error in tile debugging:', error);
        }
      }, 1000);
      
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
    
    // Debug tile loading
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles') {
        console.log('🔄 NYC tiles event:', e.isSourceLoaded ? 'LOADED' : 'LOADING', e.dataType);
        
        if (e.isSourceLoaded && e.dataType === 'source') {
          console.log('✅ NYC tiles source fully loaded');
          
          // Try to get tile data info
          setTimeout(() => {
            try {
              const features = mapInstance.querySourceFeatures('nyc-tiles');
              console.log('🔍 Features available in source:', features.length);
              if (features.length > 0) {
                const sourceLayers = [...new Set(features.map(f => (f as any).sourceLayer))];
                console.log('🔍 Available source layers:', sourceLayers);
                console.log('🔍 Sample feature properties:', features[0]?.properties);
                console.log('🔍 Sample feature geometry type:', features[0]?.geometry?.type);
              }
            } catch (e) {
              console.log('🚨 Could not query source features:', e);
            }
          }, 1000);
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
        backgroundColor: '#B3E5FC' // Light blue fallback while map loads
      }}
    >
      {/* Business loading indicator */}
      <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs p-2 rounded z-50 pointer-events-none">
        <div>🏢 Businesses: {businesses.length}</div>
        <div>⚡ Loading: {businessesLoading ? 'Yes' : 'No'}</div>
        <div>🗺️ Vector Tiles: Ready</div>
        {businesses.length === 0 && (
          <div className="text-yellow-300">⚠️ No businesses loaded</div>
        )}
      </div>
      
      {/* Deck.GL Overlay for high-performance business rendering */}
      {map && mapLoaded && businesses.length > 0 && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
          zoom={currentZoom}
        />
      )}
      
      {/* Fallback message when no businesses are visible */}
      {map && mapLoaded && businesses.length === 0 && !businessesLoading && (
        <div className="absolute bottom-4 left-4 bg-yellow-500 bg-opacity-90 text-black text-sm p-3 rounded max-w-xs">
          <div className="font-semibold">No businesses in this area</div>
          <div className="text-xs">Try moving the map or zooming out to see more businesses</div>
        </div>
      )}
    </div>
  );
};

export default MapLibreMap;