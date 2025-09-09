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

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;

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

  // Store callback refs to prevent recreation
  const onBusinessClickRef = useRef(onBusinessClick);
  const onMapLoadedRef = useRef(onMapLoaded);
  const onBusinessesLoadedRef = useRef(onBusinessesLoaded);
  
  // Update refs when props change
  useEffect(() => {
    onBusinessClickRef.current = onBusinessClick;
  }, [onBusinessClick]);
  
  useEffect(() => {
    onMapLoadedRef.current = onMapLoaded;
  }, [onMapLoaded]);
  
  useEffect(() => {
    onBusinessesLoadedRef.current = onBusinessesLoaded;
  }, [onBusinessesLoaded]);

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

  // Refs to prevent loops and track state
  const processedRef = useRef(false);
  const layersAddedRef = useRef(false);
  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchFiltersRef = useRef(searchFilters);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // NEW: Track last viewport to prevent unnecessary calls
  const lastViewportRef = useRef<{
    bounds: any;
    zoom: number;
    timestamp: number;
  } | null>(null);
  
  // NEW: Debounced loading flag
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingBusinessesRef = useRef(false);

  // Stable business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !onBusinessClickRef.current) return;
    
    console.log('🎯 Business clicked:', business.name, business.id);
    
    try {
      if (business.id && business.id.startsWith('vector_')) {
        onBusinessClickRef.current(business);
      } else if (fetchFullBusinessDetails) {
        const fullBusiness = await fetchFullBusinessDetails(business.id);
        onBusinessClickRef.current(fullBusiness || business);
      } else {
        onBusinessClickRef.current(business);
      }
    } catch (error) {
      console.warn('Error in handleBusinessClick:', error);
      onBusinessClickRef.current(business);
    }
  }, [fetchFullBusinessDetails]);

  // NEW: Improved viewport change handler with deduplication
  const handleViewportChange = useCallback(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingBusinessesRef.current) return;

    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const now = Date.now();
      
      // Check if this viewport is significantly different from the last one
      if (lastViewportRef.current) {
        const timeDiff = now - lastViewportRef.current.timestamp;
        const zoomDiff = Math.abs(zoom - lastViewportRef.current.zoom);
        
        const lastBounds = lastViewportRef.current.bounds;
        const boundsChanged = 
          Math.abs(bounds.getNorth() - lastBounds.north) > 0.001 ||
          Math.abs(bounds.getSouth() - lastBounds.south) > 0.001 ||
          Math.abs(bounds.getEast() - lastBounds.east) > 0.001 ||
          Math.abs(bounds.getWest() - lastBounds.west) > 0.001;
        
        // Skip if viewport hasn't changed significantly and it's been less than 1 second
        if (!boundsChanged && zoomDiff < 0.5 && timeDiff < 1000) {
          console.log('🔄 Skipping viewport update - no significant change');
          return;
        }
      }
      
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };

      // Update last viewport
      lastViewportRef.current = {
        bounds: viewportBounds,
        zoom,
        timestamp: now
      };

      console.log('🗺️ Loading businesses for viewport:', viewportBounds);
      
      // Set loading flag to prevent concurrent calls
      isLoadingBusinessesRef.current = true;
      
      // Clear any existing timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      const businessLimit = isMobile ? 12000 : 25000;
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      
      // Reset loading flag after a delay
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingBusinessesRef.current = false;
      }, 1000);
      
      setCurrentZoom(zoom);
    } catch (error) {
      console.error('Error in handleViewportChange:', error);
      isLoadingBusinessesRef.current = false;
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Create DeckGL layers with stable dependencies
  const deckGLLayers = useMemo(() => {
    if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
      return [];
    }
    
    try {
      let businessesToRender = businesses;
      
      // Handle clustered data
      if (isClusteredData) {
        businessesToRender = businesses.flatMap((item: any) => {
          if (item && item.type === 'cluster' && item.businesses) {
            return item.businesses;
          } else if (item && item.type !== 'cluster') {
            return [item];
          }
          return [];
        });
      }
      
      return [createBusinessScatterplotLayer({
        businesses: businessesToRender as Business[],
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
      })];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [businesses, selectedBusiness?.id, isClusteredData, handleBusinessClick]);

  // Initialize map only once
  useEffect(() => {
    if (!mapRef.current || map) return;

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
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      console.log('🗺️ Map loaded');
      setMapLoaded(true);
      if (onMapLoadedRef.current) {
        onMapLoadedRef.current();
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
    
    // Add layers when tiles are ready (excluding business dots - using DeckGL instead)
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current && mapInstance) {
        console.log('🔄 NYC tiles loaded, adding layers...');
        
        try {
          const sourceLayer = 'examplepoints';
          
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
          console.log('✅ All NYC layers added (excluding businesses - using DeckGL)!');
          
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
  }, []);

  // Initialize DeckGL overlay once
  useEffect(() => {
    if (!map || !mapLoaded || deckOverlay) return;
    
    console.log('🎯 Initializing DeckGL overlay');
    
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
        return;
      }
    }
    
    try {
      map.addControl(overlay as any);
      setDeckOverlay(overlay);
      setOverlayReady(true);
    } catch (e) {
      console.log('DeckGL overlay already added or error:', e);
      setOverlayReady(true);
    }
  }, [map, mapLoaded, deckOverlay]);

  // Update DeckGL layers with debouncing
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    
    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce updates
    updateTimeoutRef.current = setTimeout(() => {
      try {
        deckOverlay.setProps({ layers: deckGLLayers });
        console.log(`🎯 Updated DeckGL with ${deckGLLayers.length} layers`);
      } catch (error) {
        console.error('Error updating DeckGL layers:', error);
      }
    }, 100);
    
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // NEW: Improved search filter handling with deep comparison
  useEffect(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport) return;
    
    // Deep comparison for search filters
    const filtersChanged = JSON.stringify(lastSearchFiltersRef.current) !== JSON.stringify(searchFilters);
    if (!filtersChanged) return;
    
    console.log('🔍 Search filters changed:', searchFilters);
    lastSearchFiltersRef.current = searchFilters;
    
    // Reset viewport tracking to force reload
    lastViewportRef.current = null;
    isLoadingBusinessesRef.current = false;
    
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
      console.warn('⚠️ Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Zoom to selected business
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

  // Center on neighborhood
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

  // Process map features
  const processMapFeatures = useCallback(async () => {
    if (processedRef.current || !map || !mapLoaded) return;
    
    processedRef.current = true;
    (window as any).__MAP_FEATURES_PROCESSED__ = true;
    
    if (setIsProcessing) {
      setIsProcessing(true);
    }
    
    console.log('🎉 NYC vector tiles ready');
    
    if (setIsProcessing) {
      setIsProcessing(false);
    }
  }, [map, mapLoaded, setIsProcessing]);

  // Load map data after initialization
  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]);

  // NEW: Improved movement handlers with better debouncing
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const moveEndHandler = () => {
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      
      // Longer debounce to prevent excessive calls
      moveTimeoutRef.current = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 500); // Increased from 300ms to 500ms
    };
    
    map.on('moveend', moveEndHandler);
    
    // Initial load with delay to prevent immediate double calls
    setTimeout(() => {
      if (map && mapLoaded) {
        handleViewportChange();
      }
    }, 1000);
    
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Notify when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses && businesses.length > 0 && onBusinessesLoadedRef.current) {
      onBusinessesLoadedRef.current();
    }
  }, [businessesLoading, businesses]);

  // Handle emoji landmarks
  useEffect(() => {
    if (!mapLoaded || !landmarks || !Array.isArray(landmarks) || !map) return;

    // Remove previous markers
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
      const updateEmojiSize = () => {
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
      
      map.on('zoom', updateEmojiSize);
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
        try {
          map.off('zoom', updateEmojiSize);
        } catch (error) {
          console.warn('Error removing zoom listener:', error);
        }
      };
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
  }, [mapLoaded, landmarks, map]);

  // Cleanup
  useEffect(() => {
    return () => {
      console.log('🔧 MapLibreMap cleanup');
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
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