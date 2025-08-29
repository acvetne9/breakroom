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
  const [deckGLViewState, setDeckGLViewState] = useState<any>(null);
  const [clusteredBusinesses, setClusteredBusinesses] = useState<any[]>([]);
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

  // Load businesses in viewport when map moves with smooth debouncing
  const handleViewportChange = useCallback((isInitial: boolean = false) => {
    console.log('🚨 handleViewportChange CALLED!', { 
      hasMap: !!map, 
      mapLoaded,
      isInitial,
      isMoving: isMovingRef.current
    });

    if (!map || !mapLoaded) {
      console.log('⚠️ handleViewportChange: map not ready', { 
        map: !!map, 
        mapLoaded
      });
      return;
    }

    try {
      console.log('📍 Getting map bounds...');
      const bounds = map.getBounds();
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      // Cache viewport calculations to avoid repeated work
      const viewportData = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        center,
        zoom
      };

      console.log('🗺️ Map viewport data:', viewportData);
      
      const viewportBounds = {
        north: viewportData.north,
        south: viewportData.south,
        east: viewportData.east,
        west: viewportData.west
      };

      console.log('📍 Triggering business loading for viewport:', viewportBounds);

      // Update deck.gl view state efficiently
      setDeckGLViewState({
        longitude: viewportData.center.lng,
        latitude: viewportData.center.lat,
        zoom: viewportData.zoom,
        pitch: 0,
        bearing: 0
      });

      // Load businesses with increased limits and movement awareness
      const businessLimit = isMobile ? 8000 : 15000; // Significantly increased limits for better coverage
      console.log(`🎯 About to call loadBusinessesInViewport with ${businessLimit} limit for ${isMobile ? 'mobile' : 'desktop'}...`);
      
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      
      // Update zoom state
      setCurrentZoom(viewportData.zoom);
      
      console.log('✅ loadBusinessesInViewport called successfully');
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, loadBusinessesInViewport, isMobile]);

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
    
    console.log(`🗺️ Loading map data ${isMobile ? '(mobile-lite mode)' : '(full desktop mode)'}...`);
    processedRef.current = true; // prevent duplicate runs in this mount
    (window as any).__MAP_FEATURES_PROCESSED__ = true; // prevent duplicate runs across mounts
    setIsProcessing(true);
    
    try {
      const { features, landData } = await loadAllDataCenterOut();
      console.log('📦 Received data from loadAllDataCenterOut:', {
        featuresCount: features?.length || 0,
        landDataExists: !!landData,
        landFeatureCount: landData?.features?.length || 0,
        isMobile
      });

      // Add land layer first
      if (landData) {
        console.log(`🏞️ Adding land layer (${landData.features?.length} features)...`);
        addLandLayer(map, landData);
        console.log('✅ Land layer added');
      } else {
        console.log('⚠️ No land data available - this will cause visibility issues!');
      }

      if (features?.length) {
        console.log(`📍 Processing ${features.length} main features...`);
        // Create feature collection for processing
        const mainData = {
          type: 'FeatureCollection' as const,
          features
        };

        if (isMobile) {
          // Mobile mode: Load all features with chunked roads
          console.log('📱 Mobile mode: Loading all features with chunked road loading');
          const parkFeatures = extractParkFeatures(mainData);
          const parkFeatureIds = new Set(parkFeatures.map(f => f.properties?.id || f.id).filter(Boolean));
          const waterFeatures = extractWaterFeatures(mainData, parkFeatureIds);
          const roadFeatures = extractRoadFeatures(mainData);
          const waterwayFeatures = extractWaterwayFeatures(mainData);

          console.log(`🎯 Mobile extracted features:
            - Parks: ${parkFeatures.length}
            - Water: ${waterFeatures.length} 
            - Roads: ${roadFeatures.length} (will load in chunks)
            - Waterways: ${waterwayFeatures.length}`);

          // Add non-road layers first
          console.log('🎨 Adding non-road layers...');
          addParksLayer(map, parkFeatures);
          console.log(`✅ Parks layer added (${parkFeatures.length} features)`);
          addWaterLayer(map, waterFeatures);
          console.log(`✅ Water layer added (${waterFeatures.length} features)`);
          addWaterwaysLayer(map, waterwayFeatures);
          console.log(`✅ Waterways layer added (${waterwayFeatures.length} features)`);
          
          // Load roads in chunks to prevent memory crash
          console.log('🛣️ Starting chunked road loading...');
          await addRoadsLayerChunked(map, roadFeatures, true);
          console.log(`✅ All roads loaded via chunking (${roadFeatures.length} features)`);
        } else {
          // Desktop mode: Load all features
          console.log('🖥️ Desktop mode: Loading all features');
          const parkFeatures = extractParkFeatures(mainData);
          const parkFeatureIds = new Set(parkFeatures.map(f => f.properties?.id || f.id).filter(Boolean));
          const waterFeatures = extractWaterFeatures(mainData, parkFeatureIds);
          const roadFeatures = extractRoadFeatures(mainData);
          const waterwayFeatures = extractWaterwayFeatures(mainData);

          console.log(`🎯 Desktop extracted features:
            - Parks: ${parkFeatures.length}
            - Water: ${waterFeatures.length} 
            - Roads: ${roadFeatures.length}
            - Waterways: ${waterwayFeatures.length}`);

          // Add all layers for desktop
          console.log('🎨 Adding all desktop layers...');
          addParksLayer(map, parkFeatures);
          console.log(`✅ Parks layer added (${parkFeatures.length} features)`);
          addWaterLayer(map, waterFeatures);
          console.log(`✅ Water layer added (${waterFeatures.length} features)`);
          addWaterwaysLayer(map, waterwayFeatures);
          console.log(`✅ Waterways layer added (${waterwayFeatures.length} features)`);
          addRoadsLayer(map, roadFeatures);
          console.log(`✅ Roads layer added (${roadFeatures.length} features)`);
        }

        // Ensure proper layer ordering
        ensureLayerOrder(map);
        console.log('✅ Layer ordering ensured');
        
        // Log current map layers
        const mapLayers = map.getStyle().layers || [];
        console.log('🗺️ Current map layers:', mapLayers.map(l => `${l.id} (${l.type})`));
        
        // Check if map is in correct bounds
        const bounds = map.getBounds();
        const center = map.getCenter();
        console.log('🎯 Map bounds:', bounds.toArray());
        console.log('🎯 Map center:', [center.lng, center.lat]);
        console.log('🎯 Map zoom:', map.getZoom());
      } else {
        console.log('⚠️ No main features to process');
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
  }, [map, mapLoaded, isMobile]); // Removed dependencies that could cause re-runs

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      console.error('Map container not found');
      return;
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

    // Movement tracking with smooth business loading
    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      console.log('🎯 Map movement started');
    });

    mapInstance.on('moveend', () => {
      if (mapInstance) {
        const zoom = mapInstance.getZoom();
        const center = mapInstance.getCenter();
        setCurrentZoom(zoom);
        console.log(`Current zoom: ${zoom.toFixed(2)} | Center: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
        
        // Mark movement as ended after a delay to allow for smooth loading
        moveTimeoutRef.current = setTimeout(() => {
          isMovingRef.current = false;
          console.log('🎯 Map movement ended - ready for smooth loading');
        }, 200);
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
  }, [mapLoaded, map, processMapFeatures]);

  // Setup viewport loading for businesses with aggressive triggering
  useEffect(() => {
    console.log('🚀 Business loading useEffect triggered', { 
      hasMap: !!map, 
      mapLoaded,
      businessCount: businesses.length,
      effectDeps: { map: !!map, mapLoaded, businessesLength: businesses.length }
    });

    if (map && mapLoaded) {
      console.log('🔗 Setting up comprehensive business loading system - MAP AND LOADED ARE TRUE');
      
      // TEST: Try calling handleViewportChange immediately
      console.log('🧪 TEST: Calling handleViewportChange immediately...');
      try {
        handleViewportChange();
        console.log('🧪 TEST: handleViewportChange called successfully');
      } catch (error) {
        console.error('🧪 TEST: Error calling handleViewportChange:', error);
      }
      
      // Immediate business loading function
      const loadBusinessesNow = () => {
        console.log('⚡ IMMEDIATE: Loading businesses now!');
        handleViewportChange();
      };

      // Event handlers with reduced frequency for smoother experience
      const moveEndHandler = () => {
        console.log('🔄 Map move/zoom ended, triggering smooth business load...');
        handleViewportChange(false);
      };
      
      const idleHandler = () => {
        console.log('🗺️ Map idle, loading businesses...');
        handleViewportChange(false);
      };
      
      // Reduced event listeners for smoother experience
      map.on('moveend', moveEndHandler);
      map.on('idle', idleHandler);
      
      // Initial business loading with smooth approach
      console.log('🎯 Starting initial business loading...');
      
      // Try initial load
      setTimeout(() => {
        console.log('⏰ Initial business loading attempt');
        handleViewportChange(true);
      }, 300);
      
      return () => {
        map.off('moveend', moveEndHandler);
        map.off('idle', idleHandler);
        if (moveTimeoutRef.current) {
          clearTimeout(moveTimeoutRef.current);
        }
      };
    } else {
      console.log('⚠️ Business loading setup pending...', { 
        hasMap: !!map, 
        mapLoaded,
        mapStyle: map?.isStyleLoaded?.() 
      });
      
      // Even if map isn't fully ready, try loading businesses
      if (map) {
        console.log('🔄 Map exists but not fully loaded, trying business load anyway...');
        setTimeout(() => {
          console.log('🔄 Delayed attempt - calling handleViewportChange...');
          handleViewportChange();
        }, 1000);
      }
    }
  }, [map, mapLoaded, handleViewportChange, businesses.length]);

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
        <div>🗺️ Map: {mapLoaded ? 'Ready' : 'Loading'}</div>
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