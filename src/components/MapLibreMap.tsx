import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import type { GeoJSONFeature } from 'maplibre-gl';
import type { Business } from '@/types/business';

interface MapLibreMapProps {
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
  landmarks?: { lat: number; lng: number; emoji: string }[];
  onMapLoaded?: () => void;
  onBusinessesLoaded?: () => void;
  searchFilters?: any;
  neighborhoodCenter?: { lat: number; lon: number } | null;
  enableClustering?: boolean;
  isClusteredData?: boolean;
}

interface VectorTileFeature extends GeoJSONFeature {
  sourceLayer?: string;
}

// Singleton overlay for performance - integrated from DeckGLOverlay
let overlayInstance: MapboxOverlay | null = null;
let overlayUpdateTimeout: NodeJS.Timeout | null = null;

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = [],
  onMapLoaded,
  onBusinessesLoaded,
  searchFilters,
  neighborhoodCenter,
  enableClustering = true,
  isClusteredData = false
}) => {
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [currentZoom, setCurrentZoom] = useState(12);

  // Safely initialize hooks with error boundaries
  let mapDataHook;
  let businessesHook;
  
  try {
    mapDataHook = useViewportMapData();
    businessesHook = useViewportBusinesses(searchFilters, currentZoom);
  } catch (error) {
    console.error('Error initializing hooks:', error);
    mapDataHook = { isProcessing: false, setIsProcessing: () => {}, loadAllDataCenterOut: () => {} };
    businessesHook = {
      businesses: [],
      loading: false,
      loadBusinessesInViewport: () => {},
      fetchFullBusinessDetails: () => Promise.resolve(null),
      clusterBusinesses: () => {},
      isSearching: false
    };
  }

  const { isProcessing, setIsProcessing, loadAllDataCenterOut } = mapDataHook;
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clusterBusinesses,
    isSearching
  } = businessesHook;

  const processedRef = useRef(false);
  const layersAddedRef = useRef(false);
  const lastFitKeyRef = useRef<string | null>(null);

  // Enhanced business click handler that works for both vector tile and database businesses
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business) return;
    
    console.log('🎯 MapLibreMap handleBusinessClick called:', business.name, business.id);
    
    // Always call onBusinessClick with the business we have
    if (onBusinessClick) {
      if (business.id && business.id.startsWith('vector_')) {
        // Vector tile business - use as-is
        console.log('🎯 Vector tile business - using directly');
        onBusinessClick(business);
      } else if (fetchFullBusinessDetails) {
        // Database business - try to fetch full details, fallback to original
        try {
          const fullBusiness = await fetchFullBusinessDetails(business.id);
          onBusinessClick(fullBusiness || business);
        } catch (error) {
          console.warn('Failed to fetch full business details, using basic info:', error);
          onBusinessClick(business);
        }
      } else {
        onBusinessClick(business);
      }
    }
  }, [onBusinessClick, fetchFullBusinessDetails]); // Stable dependencies only

  // Movement state tracking for better debouncing
  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable viewport change handler to prevent infinite re-renders
  const handleViewportChange = useCallback((isInitial: boolean = false) => {
    if (!map || !mapLoaded) return;

    console.log('🗺️ handleViewportChange called with searchFilters:', searchFilters);

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
      console.log('🗺️ About to call loadBusinessesInViewport with searchFilters:', searchFilters);
      
      if (loadBusinessesInViewport) {
        loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      }
      
      setCurrentZoom(zoom);
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, searchFilters, loadBusinessesInViewport]);

  // Integrated DeckGL layers setup - extracted from DeckGLOverlay
  const deckGLLayers = useMemo(() => {
    if (!businesses || !Array.isArray(businesses) || businesses.length === 0) return [];
    
    try {
      // If data is pre-clustered from worker, extract individual businesses
      if (isClusteredData) {
        console.log(`🎯 Extracting individual businesses from clustered data: ${businesses.length} items`);
        const individualBusinesses = businesses.flatMap((item: any) => {
          if (item && item.type === 'cluster' && item.businesses) {
            return item.businesses;
          } else if (item && item.type !== 'cluster') {
            return [item];
          }
          return [];
        });
        
        return [createBusinessScatterplotLayer({
          businesses: individualBusinesses as Business[],
          selectedBusinessId: selectedBusiness?.id,
          onBusinessClick: handleBusinessClick,
        })];
      }
      
      console.log(`🎯 Creating scatter layer with ${businesses.length} individual clickable businesses`);
      
      return [createBusinessScatterplotLayer({
        businesses: businesses as Business[],
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
      })];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [businesses, selectedBusiness?.id, handleBusinessClick, enableClustering, isClusteredData, currentZoom]);

  // Initialize DeckGL overlay once map is loaded - integrated singleton logic
  const initializeDeckOverlay = useMemo(() => {
    if (!map || !mapLoaded) return null;
    
    console.log('🎯 Initializing DeckGL overlay');
    
    // Use singleton or create new overlay
    let overlay = overlayInstance;
    if (!overlay) {
      try {
        overlay = new MapboxOverlay({
          interleaved: true,
          layers: []
        });
        overlayInstance = overlay;
      } catch (error) {
        console.error('Error creating MapboxOverlay:', error);
        return null;
      }
    }
    
    // Add to map if not already added
    try {
      map.addControl(overlay as any);
      setOverlayReady(true);
    } catch (e) {
      // Control might already be added
      console.log('DeckGL overlay already added or error:', e);
      setOverlayReady(true);
    }
    
    return overlay;
  }, [map, mapLoaded]);

  // Update overlay reference when initialized
  useEffect(() => {
    if (initializeDeckOverlay) {
      setDeckOverlay(initializeDeckOverlay);
    }
  }, [initializeDeckOverlay]);

  // Update DeckGL layers when businesses change - integrated smooth layer updates
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    
    try {
      // Clear existing timeout
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
      
      // Direct update without timeout to prevent loops
      deckOverlay.setProps({ 
        layers: deckGLLayers
      });
      console.log(`🎯 Updated deck.gl with ${deckGLLayers.length} layers`);
    } catch (error) {
      console.error('Error updating DeckGL layers:', error);
    }
    
    return () => {
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
    };
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // Reload businesses when search filters change - prevent loops
  const searchFiltersRef = useRef(searchFilters);
  useEffect(() => {
    searchFiltersRef.current = searchFilters;
  }, [searchFilters]);

  useEffect(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport) return;
    
    const currentFilters = searchFiltersRef.current;
    
    // Stop processing if filters are null (explicitly cleared)
    if (currentFilters === null) {
      console.log('🧹 Search filters cleared - loading normal businesses');
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
    
    if (currentFilters && Object.keys(currentFilters).length > 0) {
      try {
        const mapBounds = map.getBounds();
        
        // Viewport-only search: use current map bounds
        const viewportBounds = {
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east: mapBounds.getEast(),
          west: mapBounds.getWest()
        };
        const businessLimit = isMobile ? 12000 : 25000;
        console.log('🔍 Viewport-only search: using current map bounds');
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      } catch (e) {
        console.warn('⚠️ Failed to reload businesses on filter change:', e);
      }
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Zoom to a specifically selected business
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    
    try {
      map.easeTo({
        center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 800
      });
    } catch (error) {
      console.error('Error zooming to selected business:', error);
    }
  }, [selectedBusiness?.id, map, mapLoaded]);

  // Center map on neighborhood when neighborhood is selected
  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;
    
    console.log('🏙️ Centering map on neighborhood:', neighborhoodCenter);
    try {
      map.easeTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 14,
        duration: 1000
      });
    } catch (error) {
      console.error('Error centering on neighborhood:', error);
    }
  }, [neighborhoodCenter, map, mapLoaded]);

  const processMapFeatures = useCallback(async () => {
    // Prevent duplicate processing
    const alreadyGlobalProcessed = (window as any).__MAP_FEATURES_PROCESSED__ === true;
    if (processedRef.current || alreadyGlobalProcessed) {
      return;
    }
    if (!map || !mapLoaded) {
      return;
    }
    
    processedRef.current = true;
    (window as any).__MAP_FEATURES_PROCESSED__ = true;
    
    if (setIsProcessing) {
      setIsProcessing(true);
    }
    
    console.log('🎉 NYC .pbf vector tiles ready');
    
    if (setIsProcessing) {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, setIsProcessing]);

  // Initialize map only once
  useEffect(() => {
    if (!mapRef.current || map) {
      return; // Don't reinitialize if map already exists
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
      
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('❌ Error creating map instance:', error);
      return;
    }

    // Safety monkey-patches
    if (mapInstance) {
      const _origAddLayer = (mapInstance as any).addLayer.bind(mapInstance);
      (mapInstance as any).addLayer = function (layerDef: any, before?: string) {
        try {
          const id = typeof layerDef === 'string' ? layerDef : layerDef && layerDef.id;
          if (id && this.getLayer && this.getLayer(id)) {
            console.log(`ℹ️ addLayer skipped: layer "${id}" already exists.`);
            return;
          }
          return _origAddLayer(layerDef, before);
        } catch (err) {
          console.warn('⚠️ addLayer error (ignored):', err);
          return;
        }
      };

      const _origSetPaint = (mapInstance as any).setPaintProperty.bind(mapInstance);
      (mapInstance as any).setPaintProperty = function (layerId: string, prop: string, value: any) {
        try {
          if (!this.getLayer || !this.getLayer(layerId)) {
            console.log(`ℹ️ setPaintProperty skipped: layer "${layerId}" not found.`);
            return;
          }
          return _origSetPaint(layerId, prop, value);
        } catch (err) {
          console.warn('⚠️ setPaintProperty error (ignored):', err);
          return;
        }
      };
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('🗺️ Map loaded - starting tile debugging');
    
      setMapLoaded(true);
    
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
      console.error('🚨 Map error:', e.error);
    });
    
    // Add layers when tiles are ready - REMOVED nyc-businesses circle layer
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current && mapInstance) {
        console.log('🔄 NYC tiles loaded, adding layers...');
        
        try {
          const sourceLayer = 'examplepoints';
          
          // Add all layers EXCEPT nyc-businesses (we'll use DeckGL instead)
          const layersToAdd = [
            {
              id: 'nyc-land',
              type: 'fill' as const,
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              paint: {
                'fill-color': '#F5F5DC',
                'fill-opacity': 1.0
              },
              filter: ['==', ['geometry-type'], 'Polygon']
            },
            {
              id: 'nyc-green-spaces',
              type: 'fill',
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              paint: {
                'fill-color': '#87C17A',
                'fill-opacity': 1.0
              },
              filter: [
                'all',
                ['==', ['geometry-type'], 'Polygon'],
                ['any',
                  ['==', ['get', 'leisure'], 'park'],
                  ['==', ['get', 'landuse'], 'cemetery'],
                  ['==', ['get', 'amenity'], 'cemetery'],
                  ['==', ['get', 'amenity'], 'grave_yard'],
                  ['in', 'Cemetery', ['get', 'name']],
                  ['in', 'cemetery', ['get', 'name']]
                ]
              ]
            },
            {
              id: 'nyc-water',
              type: 'fill' as const,
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              paint: {
                'fill-color': '#6CA4E1',
                'fill-opacity': 1.0
              },
              filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
            },
            {
              id: 'nyc-waterways',
              type: 'line' as const,
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              paint: {
                'line-color': '#999999',
                'line-width': 1,
                'line-opacity': 0.6
              },
              filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
            },
            {
              id: 'nyc-roads',
              type: 'line' as const,
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              paint: {
                'line-color': '#666666',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
                'line-opacity': 1.0
              },
              filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
            },
            // REMOVED: nyc-businesses layer - using DeckGL scatterplot instead
            {
              id: 'nyc-road-labels',
              type: 'symbol' as const,
              source: 'nyc-tiles',
              'source-layer': sourceLayer,
              layout: {
                'text-field': ['coalesce', ['get', 'name'], ''],
                'symbol-placement': 'line',
                'text-size': 12,
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
              },
              paint: {
                'text-color': '#2D3748',
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 1.5
              },
              filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'name'], ['has', 'highway']]
            }
          ];

          layersToAdd.forEach(layer => {
            try {
              mapInstance!.addLayer(layer as any);
            } catch (error) {
              console.warn(`Failed to add layer ${layer.id}:`, error);
            }
          });
          
          layersAddedRef.current = true;
          console.log('✅ All NYC layers added successfully (excluding businesses - using DeckGL)!');
          
        } catch (error) {
          console.error('❌ Error adding layers:', error);
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
  }, []); // Empty dependency array to prevent infinite loops

  // Load map data after initialization
  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]);

  // REMOVED: Vector tile click handlers since we're not using nyc-businesses layer anymore
  // All business clicks will now go through DeckGL scatterplot layer

  // Clean business loading setup
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout | null = null;
    
    const moveEndHandler = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      
      console.log('🗺️ Map moveend - current search filters:', searchFilters);
      
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    map.on('moveend', moveEndHandler);
    handleViewportChange(true);
    
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Notify parent when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses, onBusinessesLoaded]);

  // Emoji markers with stable reference using ref to prevent infinite loops
  const lastLandmarksHashRef = useRef('');
  
  useEffect(() => {
    if (!mapLoaded || !landmarks || !Array.isArray(landmarks) || !map) return;

    const landmarksHash = JSON.stringify(landmarks.map(l => `${l.lat}-${l.lng}-${l.emoji}`));
    if (landmarksHash === lastLandmarksHashRef.current) {
      return;
    }
    
    lastLandmarksHashRef.current = landmarksHash;
    console.log('Adding emoji landmarks:', landmarks);

    // Remove any previous markers
    landmarkMarkersRef.current.forEach(m => {
      try {
        m.remove();
      } catch (error) {
        console.warn('Error removing marker:', error);
      }
    });
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
          try {
            const element = marker.getElement();
            if (element) {
              element.style.fontSize = `${size}px`;
              element.style.lineHeight = `${size}px`;
              element.style.width = `${size}px`;
              element.style.height = `${size}px`;
            }
          } catch (error) {
            console.warn('Error updating marker size:', error);
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

        try {
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([landmark.lng, landmark.lat])
            .addTo(map);
          
          return marker;
        } catch (error) {
          console.error(`Error creating marker ${index}:`, error);
          return null;
        }
      }).filter(Boolean) as maplibregl.Marker[];

      landmarkMarkersRef.current = newMarkers;
      
      if (updateEmojiSize) {
        map.on('zoom', updateEmojiSize);
      }
      console.log(`Successfully added ${newMarkers.length} emoji markers`);

      return () => {
        landmarkMarkersRef.current.forEach(m => {
          try {
            m.remove();
          } catch (error) {
            console.warn('Error removing marker in cleanup:', error);
          }
        });
        landmarkMarkersRef.current = [];
        if (updateEmojiSize && map) {
          try {
            map.off('zoom', updateEmojiSize);
          } catch (error) {
            console.warn('Error removing zoom listener:', error);
          }
        }
      };
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
  }, [mapLoaded, landmarks, map]);

  // Integrated cleanup from DeckGLOverlay
  useEffect(() => {
    return () => {
      console.log('🔧 MapLibreMap cleanup (including DeckGL)');
      if (overlayUpdateTimeout) {
        clearTimeout(overlayUpdateTimeout);
      }
    };
  }, []);

  
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
    />
  );
};

export default MapLibreMap;