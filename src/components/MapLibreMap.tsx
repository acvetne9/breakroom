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
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = [],
  onMapLoaded,
  onBusinessesLoaded,
  searchFilters
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

  // Reload businesses whenever search filters change - expand area significantly for comprehensive search
  useEffect(() => {
    if (!map || !mapLoaded) return;
    console.log('🗺️ Map reloading businesses due to filter change:', searchFilters);
    
    // Stop processing if filters are undefined/null (cleared)
    if (searchFilters === undefined || searchFilters === null) {
      console.log('🧹 Search filters cleared - loading normal businesses');
      // Reload normal businesses when filters are cleared
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
        console.warn('⚠️ Failed to reload normal businesses:', e);
      }
      return;
    }
    
    try {
      const mapBounds = map.getBounds();
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      let viewportBounds;
      let businessLimit;
      
      if (searchFilters && Object.keys(searchFilters).length > 0) {
        // Expand search area significantly to query all possible matching businesses
        const expansionFactor = zoom > 13 ? 3.0 : zoom > 11 ? 4.0 : 5.0;
        const latRange = mapBounds.getNorth() - mapBounds.getSouth();
        const lngRange = mapBounds.getEast() - mapBounds.getWest();
        
        viewportBounds = {
          north: center.lat + (latRange * expansionFactor) / 2,
          south: center.lat - (latRange * expansionFactor) / 2,
          east: center.lng + (lngRange * expansionFactor) / 2,
          west: center.lng - (lngRange * expansionFactor) / 2
        };
        businessLimit = 10000; // Higher limit for comprehensive search
        
        console.log(`🔍 Expanded search area by ${expansionFactor}x for filtering`);
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      }
    } catch (e) {
      console.warn('⚠️ Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Disable auto-zoom on search results to respect user preference
  useEffect(() => {
    // Intentionally no-op: do not fit/zoom when search results change
  }, [businesses, searchFilters, map, mapLoaded]);

  // Zoom to a specifically selected business (e.g. from search dropdown)
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 800
    });
  }, [selectedBusiness?.id, map, mapLoaded]);

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

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    console.log('🧭 Using tiles URL:', absoluteTilesUrl);

    const baseStyle = {
      version: 8 as const,
      sources: {
        'nyc-tiles': {
          type: 'vector' as const,
          tiles: [absoluteTilesUrl],
          minzoom: 10,
          maxzoom: 16,
          // Add scheme to handle potential encoding issues
          scheme: 'xyz' as const
        }
      },
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#F5F5DC' } // Wheat color for land background
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
      
      // Defer adding layers until the source reports as fully loaded via `sourcedata`
      console.log('⏳ Waiting for nyc-tiles source to fully load before adding layers');
      
      setMapLoaded(true);
      
      // Notify parent that map is loaded
      if (onMapLoaded) {
        onMapLoaded();
      }
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
    
    // Enhanced tile loading debug with comprehensive diagnostics
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles') {
        console.log('🔄 NYC tiles event:', e.isSourceLoaded ? 'LOADED' : 'LOADING', e.dataType, e);
        
        // Log tile-specific events for detailed debugging
        if ((e as any).dataType === 'tile') {
          const coord = (e as any).coord;
          console.log(`📍 Tile loaded: ${coord ? `${coord.z}/${coord.x}/${coord.y}` : 'unknown'}`);
          
            // Immediately query this specific tile's features
            setTimeout(() => {
              try {
                if (mapInstance && mapInstance.isSourceLoaded && mapInstance.isSourceLoaded('nyc-tiles')) {
                  const allFeatures = mapInstance.querySourceFeatures('nyc-tiles');
                  const sourceLayers = Array.from(new Set(allFeatures.map((f: any) => f.sourceLayer)));
                  console.log(`🔍 After tile load - Features: ${allFeatures.length}, Source-layers: [${sourceLayers.join(', ')}]`);
                  
                  if (allFeatures.length > 0) {
                    console.log('📋 Sample feature:', JSON.stringify(allFeatures[0], null, 2));
                  }
                }
              } catch (err) {
                console.warn('⚠️ Error querying features after tile load:', err);
              }
            }, 100);
        }
        
        // Try adding layers on any significant event
        if ((e as any).dataType === 'tile' || ((e as any).dataType === 'source' && mapInstance.isSourceLoaded('nyc-tiles'))) {
          if (layersAddedRef.current) {
            console.log('ℹ️ Layers already added, skipping.');
            return;
          }
          
          console.log('🎯 Attempting to add layers...');
          
          try {
            // NEW: Immediately try adding layers with known source-layer to trigger tile loading
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
                console.log('✅ Pre-added examplepoints line layer to initiate tile loads');
              } catch (preLineErr) {
                console.warn('⚠️ Pre-add line failed (may be fine if layer name differs):', preLineErr);
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
                console.log('✅ Pre-added examplepoints labels');
              } catch (preLabelErr) {
                console.warn('⚠️ Pre-add labels failed (may be fine if layer name differs):', preLabelErr);
              }
              console.log('🧪 Pre-added layers using known layer name to trigger vector tile loading');
            }
            
            // Multiple query attempts with delays to catch async tile parsing
            const queryAttempts = [0, 200, 500, 1000];
            
            queryAttempts.forEach((delay, index) => {
              setTimeout(() => {
                try {
                  if (mapInstance && mapInstance.isSourceLoaded && mapInstance.isSourceLoaded('nyc-tiles')) {
                    const features = mapInstance.querySourceFeatures('nyc-tiles');
                    const sourceLayers = Array.from(new Set(features.map((f: any) => f.sourceLayer)));
                    
                    console.log(`🔍 Query attempt ${index + 1} (${delay}ms delay): ${features.length} features, source-layers: [${sourceLayers.join(', ')}]`);
                    
                     // If no source-layers detected yet, proactively probe the known layer name
                     if (sourceLayers.length === 0 && !layersAddedRef.current) {
                       try {
                         const guess = mapInstance.querySourceFeatures('nyc-tiles', { sourceLayer: 'examplepoints' as any });
                         console.log(`🧪 Probe 'examplepoints': ${guess.length} features`);
                         if (guess.length > 0) {
                           const detectedLayer = 'examplepoints';
                           console.log('🧭 Using probed layer:', detectedLayer);
                         
                         // Add land/park polygon layers with proper colors
                         try {
                           mapInstance.addLayer({
                             id: 'nyc-land',
                             type: 'fill',
                             source: 'nyc-tiles',
                             'source-layer': detectedLayer,
                             paint: {
                               'fill-color': '#F5F5DC', // Wheat color for land
                               'fill-opacity': 1.0
                             },
                             filter: ['==', ['geometry-type'], 'Polygon']
                           });
                           console.log('✅ Added land layer (probed)');
                         } catch (landErr) {
                           console.warn('⚠️ Land layer (probed) failed:', landErr);
                         }
                         
                         // Add parks layer
                         try {
                           mapInstance.addLayer({
                            id: 'nyc-green-spaces',
                            type: 'fill',
                            source: 'nyc-tiles',
                            'source-layer': detectedLayer,
                            paint: {
                              'fill-color': '#87C17A', // Green for both
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
                           console.log('✅ Added parks layer (probed)');
                         } catch (parksErr) {
                           console.warn('⚠️ Parks layer (probed) failed:', parksErr);
                         }
                         
                         // Add water layer
                         try {
                           mapInstance.addLayer({
                             id: 'nyc-water',
                             type: 'fill',
                             source: 'nyc-tiles',
                             'source-layer': detectedLayer,
                             paint: {
                               'fill-color': '#6CA4E1', // Blue for water
                               'fill-opacity': 1.0
                             },
                             filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
                           });
                           console.log('✅ Added water layer (probed)');
                         } catch (waterErr) {
                           console.warn('⚠️ Water layer (probed) failed:', waterErr);
                         }
                         
                         // Add roads layer
                         try {
                           mapInstance.addLayer({
                             id: 'nyc-roads',
                             type: 'line',
                             source: 'nyc-tiles',
                             'source-layer': detectedLayer,
                             paint: {
                               'line-color': '#666666', // Dark gray for roads
                               'line-width': 2,
                               'line-opacity': 1.0
                             },
                             filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
                           });
                           console.log('✅ Added roads layer (probed)');
                         } catch (roadsErr) {
                           console.warn('⚠️ Roads layer (probed) failed:', roadsErr);
                         }
                         
                         // Add waterways layer
                         try {
                           mapInstance.addLayer({
                             id: 'nyc-waterways',
                             type: 'line',
                             source: 'nyc-tiles',
                             'source-layer': detectedLayer,
                             paint: {
                               'line-color': '#999999', // Light gray for waterways
                               'line-width': 1,
                               'line-opacity': 0.6
                             },
                             filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
                           });
                           console.log('✅ Added waterways layer (probed)');
                         } catch (waterwaysErr) {
                           console.warn('⚠️ Waterways layer (probed) failed:', waterwaysErr);
                         }
                         
                         // Add businesses points layer
                         try {
                           mapInstance.addLayer({
                             id: 'nyc-businesses',
                             type: 'circle',
                             source: 'nyc-tiles',
                             'source-layer': detectedLayer,
                             paint: {
                               'circle-color': '#FACC15', // Yellow for businesses
                               'circle-radius': 8,
                               'circle-opacity': 1.0,
                               'circle-stroke-width': 2,
                               'circle-stroke-color': '#FFFFFF'
                             },
                             filter: ['==', ['geometry-type'], 'Point']
                           });
                           console.log('✅ Added businesses layer (probed)');
                         } catch (businessesErr) {
                           console.warn('⚠️ Businesses layer (probed) failed:', businessesErr);
                         }
                         
                         layersAddedRef.current = true;
                         console.log('🎉 NYC layers added successfully! (probed)');
                         return; // stop further attempts
                         }
                       } catch (probeErr) {
                         console.warn('⚠️ Probe failed (may be fine if layer name differs):', probeErr);
                       }
                     }
                  
                  if (sourceLayers.length > 0 && !layersAddedRef.current) {
                    const detectedLayer = sourceLayers[0];
                    console.log('🧭 Detected layer:', detectedLayer, 'from', sourceLayers);
                    
                    // Add land/park polygon layers with proper colors
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-land',
                        type: 'fill',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'fill-color': '#F5F5DC', // Wheat color for land
                          'fill-opacity': 1.0
                        },
                        filter: ['==', ['geometry-type'], 'Polygon']
                      });
                      console.log('✅ Added land layer');
                    } catch (landErr) {
                      console.warn('⚠️ Land layer failed:', landErr);
                    }
                    
                    // Add parks layer
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-parks',
                        type: 'fill',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'fill-color': '#87C17A', // Green for parks
                          'fill-opacity': 1.0
                        },
                        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'leisure']]
                      });
                      console.log('✅ Added parks layer');
                    } catch (parksErr) {
                      console.warn('⚠️ Parks layer failed:', parksErr);
                    }
                    
                    // Add water layer
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-water',
                        type: 'fill',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'fill-color': '#6CA4E1', // Blue for water
                          'fill-opacity': 1.0
                        },
                        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
                      });
                      console.log('✅ Added water layer');
                    } catch (waterErr) {
                      console.warn('⚠️ Water layer failed:', waterErr);
                    }
                    
                    // Add roads layer
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-roads',
                        type: 'line',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'line-color': '#666666', // Dark gray for roads
                          'line-width': 2,
                          'line-opacity': 1.0
                        },
                        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
                      });
                      console.log('✅ Added roads layer');
                    } catch (roadsErr) {
                      console.warn('⚠️ Roads layer failed:', roadsErr);
                    }
                    
                    // Add waterways layer
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-waterways',
                        type: 'line',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'line-color': '#999999', // Light gray for waterways
                          'line-width': 1,
                          'line-opacity': 0.6
                        },
                        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
                      });
                      console.log('✅ Added waterways layer');
                    } catch (waterwaysErr) {
                      console.warn('⚠️ Waterways layer failed:', waterwaysErr);
                    }
                    
                    // Add businesses points layer
                    try {
                      mapInstance.addLayer({
                        id: 'nyc-businesses',
                        type: 'circle',
                        source: 'nyc-tiles',
                        'source-layer': detectedLayer,
                        paint: {
                          'circle-color': '#FACC15', // Yellow for businesses
                          'circle-radius': 8,
                          'circle-opacity': 1.0,
                          'circle-stroke-width': 2,
                          'circle-stroke-color': '#FFFFFF'
                        },
                        filter: ['==', ['geometry-type'], 'Point']
                      });
                      console.log('✅ Added businesses layer');
                    } catch (businessesErr) {
                      console.warn('⚠️ Businesses layer failed:', businessesErr);
                    }
                    
                    layersAddedRef.current = true;
                    console.log('🎉 NYC layers added successfully!');
                   }
                 }
               } catch (queryErr) {
                 console.warn(`⚠️ Query attempt ${index + 1} failed:`, queryErr);
               }
             }, delay);
           });
            
          } catch (error) {
            console.error('🚨 Error in layer addition process:', error);
          }
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
        // Do not auto-load on pan/zoom while a search filter is active
        if (!searchFilters) {
          handleViewportChange();
        }
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
      return; // No change in landmarks, skip reload
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
      {map && mapLoaded && (
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