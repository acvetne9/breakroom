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
  addParksAndCemeteriesLayer,
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
  onMapLoaded?: () => void;
  onBusinessesLoaded?: () => void;
  searchFilters?: any;
  neighborhoodCenter?: { lat: number; lon: number } | null;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = [],
  onMapLoaded,
  onBusinessesLoaded,
  searchFilters,
  neighborhoodCenter
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
    clusterBusinesses,
    isSearching
  } = useViewportBusinesses(searchFilters);
  const processedRef = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(12);
  const layersAddedRef = useRef(false);
  const lastFitKeyRef = useRef<string | null>(null);

  // Fixed business click handler with better error handling and simpler logic
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('Business clicked:', business.name || business.id);
    
    if (!business) {
      console.error('No business data provided to click handler');
      return;
    }

    try {
      // Always call the parent click handler first, regardless of data completeness
      if (onBusinessClick) {
        // If business doesn't have full details, fetch them
        if (!business.atmosphere?.length && !business.roles?.length && business.id) {
          console.log('Fetching full business details for:', business.id);
          
          // Fetch full details in the background
          const fullBusinessPromise = fetchFullBusinessDetails(business.id);
          
          // Call parent immediately with current data
          onBusinessClick(business);
          
          // Try to update with full details when available
          try {
            const fullBusiness = await fullBusinessPromise;
            if (fullBusiness && onBusinessClick) {
              console.log('Updated with full business details');
              onBusinessClick(fullBusiness);
            }
          } catch (fetchError) {
            console.warn('Failed to fetch full business details:', fetchError);
            // Parent already called with basic data, so this is non-fatal
          }
        } else {
          // Business already has full details
          onBusinessClick(business);
        }
      }
      
      // Zoom to business after calling parent handler
      if (map && business.position) {
        const currentZoom = map.getZoom();
        const targetZoom = Math.max(currentZoom, 16);
        
        map.easeTo({
          center: [business.position.lng, business.position.lat],
          zoom: targetZoom,
          duration: 800
        });
      }
      
    } catch (error) {
      console.error('Error in business click handler:', error);
      
      // Fallback: still try to call parent with whatever data we have
      if (onBusinessClick) {
        onBusinessClick(business);
      }
    }
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

  // Movement state tracking for better debouncing
  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if vector tile business layers should be hidden during search
  const [hideVectorBusinesses, setHideVectorBusinesses] = useState(false);

  // Stable viewport change handler to prevent infinite re-renders
  const handleViewportChange = useCallback((isInitial: boolean = false) => {
    if (!map || !mapLoaded) return;

    console.log('Viewport change - searchFilters:', searchFilters);

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
      console.error('Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, searchFilters]);

  // Reload businesses whenever search filters change
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    // Don't trigger on initial render when searchFilters is undefined
    if (searchFilters === undefined) return;
    
    console.log('Reloading businesses due to filter change:', searchFilters);
    
    // Handle search filter changes for vector tile visibility
    if (searchFilters && Object.keys(searchFilters).length > 0) {
      console.log('Active search - hiding vector tile businesses');
      setHideVectorBusinesses(true);
    } else {
      console.log('No active search - showing vector tile businesses');
      setHideVectorBusinesses(false);
    }
    
    // Stop processing if filters are null (explicitly cleared)
    if (searchFilters === null) {
      console.log('Search filters cleared - loading normal businesses');
      try {
        const mapBounds = map.getBounds();
        const viewportBounds = {
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east: mapBounds.getEast(),
          west: mapBounds.getWest()
        };
        const businessLimit = isMobile ? 12000 : 25000;
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      } catch (e) {
        console.warn('Failed to reload normal businesses:', e);
      }
      return;
    }
    
    try {
      const mapBounds = map.getBounds();
      
      if (searchFilters && Object.keys(searchFilters).length > 0) {
        // Viewport-only search: use current map bounds
        const viewportBounds = {
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east: mapBounds.getEast(),
          west: mapBounds.getWest()
        };
        const businessLimit = isMobile ? 12000 : 25000;
        console.log('Viewport-only search: using current map bounds');
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      }
    } catch (e) {
      console.warn('Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Zoom to a specifically selected business (e.g. from search dropdown)
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 800
    });
  }, [selectedBusiness?.id, map, mapLoaded]);

  // Center map on neighborhood when neighborhood is selected
  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;
    
    console.log('Centering map on neighborhood:', neighborhoodCenter);
    map.easeTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 1000
    });
  }, [neighborhoodCenter, map, mapLoaded]);

  const processMapFeatures = useCallback(async () => {
    // Prevent duplicate processing across re-mounts
    const alreadyGlobalProcessed = (window as any).__MAP_FEATURES_PROCESSED__ === true;
    if (processedRef.current || alreadyGlobalProcessed) {
      return;
    }
    if (!map || !mapLoaded) {
      return;
    }
    
    processedRef.current = true;
    (window as any).__MAP_FEATURES_PROCESSED__ = true;
    setIsProcessing(true);
    
    console.log('NYC .pbf vector tiles ready');
    setIsProcessing(false);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    console.log('Using tiles URL:', absoluteTilesUrl);

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
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#F5F5DC' }
          }
        ]
    };

    try {
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: false
      });
      
      // Set bounds immediately after creation
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('Map loaded - starting tile debugging');
      
      // Immediate tile access test
      fetch('/data/tiles/12/1203/1536.pbf')
        .then(response => {
          console.log('Tile URL test:', response.status, response.ok ? 'OK' : 'Failed');
          if (!response.ok) {
            console.error('Tiles are not accessible at /data/tiles/');
          }
          return response.arrayBuffer();
        })
        .then(buffer => {
          console.log('Tile size:', buffer.byteLength, 'bytes');
        })
        .catch(error => {
          console.error('Tile access failed:', error);
        });
      
      console.log('Waiting for nyc-tiles source to fully load before adding layers');
      
      setMapLoaded(true);
      
      // Notify parent that map is loaded
      if (onMapLoaded) {
        onMapLoaded();
      }
    });

    // Movement tracking
    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    });

    mapInstance.on('error', e => {
      console.error('Map error:', e.error);
    });
    
    // Enhanced tile loading with layer addition
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles') {
        console.log('NYC tiles event:', e.isSourceLoaded ? 'LOADED' : 'LOADING', e.dataType);
        
        if ((e as any).dataType === 'tile') {
          const coord = (e as any).coord;
          console.log(`Tile loaded: ${coord ? `${coord.z}/${coord.x}/${coord.y}` : 'unknown'}`);
          
          // Query features after tile load
          setTimeout(() => {
            try {
              if (mapInstance && mapInstance.isSourceLoaded && mapInstance.isSourceLoaded('nyc-tiles')) {
                const allFeatures = mapInstance.querySourceFeatures('nyc-tiles');
                const sourceLayers = Array.from(new Set(allFeatures.map((f: any) => f.sourceLayer)));
                console.log(`After tile load - Features: ${allFeatures.length}, Source-layers: [${sourceLayers.join(', ')}]`);
                
                if (allFeatures.length > 0) {
                  console.log('Sample feature:', JSON.stringify(allFeatures[0], null, 2));
                }
              }
            } catch (err) {
              console.warn('Error querying features after tile load:', err);
            }
          }, 100);
        }
        
        // Try adding layers
        if ((e as any).dataType === 'tile' || ((e as any).dataType === 'source' && mapInstance.isSourceLoaded('nyc-tiles'))) {
          if (layersAddedRef.current) {
            return;
          }
          
          console.log('Attempting to add layers...');
          
          try {
            // Add layers with known source-layer to trigger tile loading
            if (!layersAddedRef.current) {
              try {
                mapInstance.addLayer({
                  id: 'examplepoints-line',
                  type: 'line',
                  source: 'nyc-tiles',
                  'source-layer': 'examplepoints',
                  paint: {
                    'line-color': '#0B7285',
                    'line-width': [
                      'interpolate', ['linear'], ['zoom'],
                      10, 0.5,
                      14, 1.5,
                      16, 3
                    ],
                    'line-opacity': 0.9
                  }
                });
              } catch (preLineErr) {
                console.warn('Pre-add line failed:', preLineErr);
              }
              
              try {
                mapInstance.addLayer({
                  id: 'examplepoints-labels',
                  type: 'symbol',
                  source: 'nyc-tiles',
                  'source-layer': 'examplepoints',
                  layout: {
                    'text-field': ['coalesce', ['get', 'name'], ''],
                    'text-size': 11,
                    'symbol-placement': 'line'
                  },
                  paint: {
                    'text-color': '#0B7285',
                    'text-halo-color': '#FFFFFF',
                    'text-halo-width': 1
                  }
                });
              } catch (preLabelErr) {
                console.warn('Pre-add labels failed:', preLabelErr);
              }
            }
            
            // Multiple query attempts with delays
            const queryAttempts = [0, 200, 500, 1000];
            
            queryAttempts.forEach((delay, index) => {
              setTimeout(() => {
                try {
                  if (mapInstance && mapInstance.isSourceLoaded && mapInstance.isSourceLoaded('nyc-tiles')) {
                    const features = mapInstance.querySourceFeatures('nyc-tiles');
                    const sourceLayers = Array.from(new Set(features.map((f: any) => f.sourceLayer)));
                    
                    console.log(`Query attempt ${index + 1} (${delay}ms delay): ${features.length} features, source-layers: [${sourceLayers.join(', ')}]`);
                    
                    // Probe known layer name if no layers detected
                    if (sourceLayers.length === 0 && !layersAddedRef.current) {
                      try {
                        const guess = mapInstance.querySourceFeatures('nyc-tiles', { sourceLayer: 'examplepoints' as any });
                        console.log(`Probe 'examplepoints': ${guess.length} features`);
                        if (guess.length > 0) {
                          const detectedLayer = 'examplepoints';
                          console.log('Using probed layer:', detectedLayer);
                        
                          // Add all the map layers
                          this.addMapLayers(mapInstance, detectedLayer);
                          layersAddedRef.current = true;
                          console.log('NYC layers added successfully! (probed)');
                          return;
                        }
                      } catch (probeErr) {
                        console.warn('Probe failed:', probeErr);
                      }
                    }
                  
                    if (sourceLayers.length > 0 && !layersAddedRef.current) {
                      const detectedLayer = sourceLayers[0];
                      console.log('Detected layer:', detectedLayer);
                      
                      addMapLayers(mapInstance, detectedLayer);
                      layersAddedRef.current = true;
                      console.log('NYC layers added successfully!');
                    }
                  }
                } catch (queryErr) {
                  console.warn(`Query attempt ${index + 1} failed:`, queryErr);
                }
              }, delay);
            });
            
          } catch (error) {
            console.error('Error in layer addition process:', error);
          }
        }
      }
    });

    // Helper function to add map layers
    const addMapLayers = (mapInstance: maplibregl.Map, detectedLayer: string) => {
      // Add land layer
      try {
        mapInstance.addLayer({
          id: 'nyc-land',
          type: 'fill',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'fill-color': '#F5F5DC',
            'fill-opacity': 1.0
          },
          filter: ['==', ['geometry-type'], 'Polygon']
        });
      } catch (landErr) {
        console.warn('Land layer failed:', landErr);
      }
      
      // Add parks layer
      try {
        mapInstance.addLayer({
          id: 'nyc-green-spaces',
          type: 'fill',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'fill-color': '#87C17A',
            'fill-opacity': 1.0
          },
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['any',
              ['==', ['get', 'leisure'], 'park'],
              ['==', ['get', 'landuse'], 'cemetery']
            ]
          ]
        });
      } catch (parksErr) {
        console.warn('Parks layer failed:', parksErr);
      }
      
      // Add water layer
      try {
        mapInstance.addLayer({
          id: 'nyc-water',
          type: 'fill',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'fill-color': '#6CA4E1',
            'fill-opacity': 1.0
          },
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
        });
      } catch (waterErr) {
        console.warn('Water layer failed:', waterErr);
      }
      
      // Add roads layer
      try {
        mapInstance.addLayer({
          id: 'nyc-roads',
          type: 'line',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'line-color': '#666666',
            'line-width': 2,
            'line-opacity': 1.0
          },
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
        });
      } catch (roadsErr) {
        console.warn('Roads layer failed:', roadsErr);
      }
      
      // Add waterways layer
      try {
        mapInstance.addLayer({
          id: 'nyc-waterways',
          type: 'line',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'line-color': '#999999',
            'line-width': 1,
            'line-opacity': 0.6
          },
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
        });
      } catch (waterwaysErr) {
        console.warn('Waterways layer failed:', waterwaysErr);
      }
      
      // Add businesses points layer
      try {
        mapInstance.addLayer({
          id: 'nyc-businesses',
          type: 'circle',
          source: 'nyc-tiles',
          'source-layer': detectedLayer,
          paint: {
            'circle-color': '#FACC15',
            'circle-radius': 8,
            'circle-opacity': 1.0,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-opacity': 1.0
          },
          filter: ['==', ['geometry-type'], 'Point']
        });
      } catch (businessesErr) {
        console.warn('Businesses layer failed:', businessesErr);
      }
    };

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

  // Load map data after initialization
  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]);

  // Clean business loading setup with proper debouncing
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout | null = null;
    
    const moveEndHandler = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    map.on('moveend', moveEndHandler);
    
    // Initial load
    handleViewportChange(true);
    
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Handle business layer cleanup and deck.gl integration
  useEffect(() => {
    if (!mapLoaded || !map) return;

    // Remove old businesses layer if it exists
    if (map.getLayer('businesses-layer')) {
      map.removeLayer('businesses-layer');
    }
    if (map.getSource('businesses')) {
      map.removeSource('businesses');
    }
    // Hide debug vector-tile businesses to avoid duplicate points
    if (map.getLayer('nyc-businesses')) {
      map.setLayoutProperty('nyc-businesses', 'visibility', 'none');
    }
  }, [mapLoaded, map]);
  
  // Control vector tile business visibility during search
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    if (map.getLayer('nyc-businesses')) {
      const visibility = hideVectorBusinesses ? 'none' : 'visible';
      map.setLayoutProperty('nyc-businesses', 'visibility', visibility);
    }
  }, [hideVectorBusinesses, map, mapLoaded]);

  // Notify parent when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses.length, onBusinessesLoaded]);

  // Emoji markers with stable reference to prevent reloading
  const [lastLandmarksHash, setLastLandmarksHash] = useState('');
  
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;

    // Create a hash of landmarks to check if they actually changed
    const landmarksHash = JSON.stringify(landmarks.map(l => `${l.lat}-${l.lng}-${l.emoji}`));
    if (landmarksHash === lastLandmarksHash) {
      return;
    }
    
    setLastLandmarksHash(landmarksHash);

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
  }, [mapLoaded, landmarks, map, lastLandmarksHash]);

  
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
        backgroundColor: '#B3E5FC'
      }}
    >
      {/* Deck.GL Overlay for high-performance business rendering */}
      {map && mapLoaded && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
          zoom={currentZoom}
        />
      )}
    </div>
  );
};

export default MapLibreMap;