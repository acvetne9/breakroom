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

  // Stable refs to prevent recreation
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const processedRef = useRef(false);
  const layersAddedRef = useRef(false);
  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  // Memoize search filters to prevent unnecessary changes
  const memoizedSearchFilters = useMemo(() => searchFilters, [JSON.stringify(searchFilters)]);

  // Safely initialize hooks with error boundaries
  let mapDataHook;
  let businessesHook;
  
  try {
    mapDataHook = useViewportMapData();
    businessesHook = useViewportBusinesses(memoizedSearchFilters, currentZoom);
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

  // Stable business click handler with minimal dependencies
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !onBusinessClick) return;
    
    console.log('🎯 Business clicked:', business.name, business.id);
    
    try {
      if (business.id && business.id.startsWith('vector_')) {
        onBusinessClick(business);
      } else if (fetchFullBusinessDetails) {
        const fullBusiness = await fetchFullBusinessDetails(business.id);
        onBusinessClick(fullBusiness || business);
      } else {
        onBusinessClick(business);
      }
    } catch (error) {
      console.warn('Error in handleBusinessClick:', error);
      onBusinessClick(business);
    }
  }, [onBusinessClick, fetchFullBusinessDetails]);

  // Stable viewport change handler
  const handleViewportChange = useCallback(() => {
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance || !mapLoaded || !loadBusinessesInViewport) return;

    try {
      const bounds = mapInstance.getBounds();
      const zoom = mapInstance.getZoom();
      
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };

      const businessLimit = isMobile ? 12000 : 25000;
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      
      setCurrentZoom(zoom);
    } catch (error) {
      console.error('Error in handleViewportChange:', error);
    }
  }, [mapLoaded, isMobile, loadBusinessesInViewport]);

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

  // Initialize map only once - fixed to prevent infinite recreation
  useEffect(() => {
    if (!mapRef.current || initializedRef.current) return;
    
    initializedRef.current = true;
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
      mapInstanceRef.current = mapInstance;
      
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
      setMap(mapInstance);
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
    
    // Add layers when tiles are ready
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
          console.log('✅ All NYC layers added!');
          
        } catch (error) {
          console.error('❌ Error adding layers:', error);
        }
      }
    });

    return () => {
      cleanedUp = true;
      initializedRef.current = false;
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        } finally {
          layersAddedRef.current = false;
          mapInstanceRef.current = null;
        }
      }
      setMap(null);
      setMapLoaded(false);
    };
  }, []); // Empty dependency array - only run once

  // Initialize DeckGL overlay with error handling
  useEffect(() => {
    if (!map || !mapLoaded || deckOverlay) return;
    
    console.log('🎯 Initializing DeckGL overlay');
    
    try {
      let overlay = overlayInstance;
      if (!overlay) {
        if (typeof MapboxOverlay !== 'function') {
          console.error('MapboxOverlay is not available');
          return;
        }
        
        overlay = new MapboxOverlay({
          interleaved: true,
          layers: []
        });
        overlayInstance = overlay;
      }
      
      map.addControl(overlay as any);
      setDeckOverlay(overlay);
      setOverlayReady(true);
    } catch (error) {
      console.error('Error initializing DeckGL overlay:', error);
      setOverlayReady(false);
    }
  }, [map, mapLoaded]);

  // Update DeckGL layers with debouncing
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
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

  // Handle search filter changes
  useEffect(() => {
    if (!mapLoaded || !loadBusinessesInViewport || !mapInstanceRef.current) return;
    
    console.log('🔍 Search filters changed:', memoizedSearchFilters);
    
    try {
      const mapBounds = mapInstanceRef.current.getBounds();
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
  }, [memoizedSearchFilters, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Zoom to selected business
  useEffect(() => {
    if (!mapLoaded || !selectedBusiness?.position || !mapInstanceRef.current) return;
    
    try {
      mapInstanceRef.current.easeTo({
        center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
        zoom: Math.max(mapInstanceRef.current.getZoom(), 16),
        duration: 800
      });
    } catch (error) {
      console.error('Error zooming to selected business:', error);
    }
  }, [selectedBusiness?.id, mapLoaded]);

  // Center on neighborhood
  useEffect(() => {
    if (!mapLoaded || !neighborhoodCenter || !mapInstanceRef.current) return;
    
    console.log('🏙️ Centering map on neighborhood:', neighborhoodCenter);
    try {
      mapInstanceRef.current.easeTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 14,
        duration: 1000
      });
    } catch (error) {
      console.error('Error centering on neighborhood:', error);
    }
  }, [neighborhoodCenter, mapLoaded]);

  // Process map features
  const processMapFeatures = useCallback(() => {
    if (processedRef.current || !mapInstanceRef.current || !mapLoaded) return;
    
    processedRef.current = true;
    (window as any).__MAP_FEATURES_PROCESSED__ = true;
    
    if (setIsProcessing) {
      setIsProcessing(true);
    }
    
    console.log('🎉 NYC vector tiles ready');
    
    if (setIsProcessing) {
      setIsProcessing(false);
    }
  }, [mapLoaded, setIsProcessing]);

  // Load map data after initialization
  useEffect(() => {
    if (mapLoaded && mapInstanceRef.current && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, processMapFeatures]);

  // Set up movement handlers
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;

    const moveEndHandler = () => {
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      
      moveTimeoutRef.current = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    mapInstanceRef.current.on('moveend', moveEndHandler);
    
    // Initial load
    handleViewportChange();
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('moveend', moveEndHandler);
      }
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, [mapLoaded, handleViewportChange]);

  // Notify when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses, onBusinessesLoaded]);

  // Handle emoji landmarks
  useEffect(() => {
    if (!mapLoaded || !landmarks || !Array.isArray(landmarks) || !mapInstanceRef.current) return;

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
        const zoom = mapInstanceRef.current?.getZoom() || 12;
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
        const zoom = mapInstanceRef.current?.getZoom() || 12;
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
            .addTo(mapInstanceRef.current!);
          
          return marker;
        } catch (error) {
          console.error(`Error creating marker ${index}:`, error);
          return null;
        }
      }).filter(Boolean) as maplibregl.Marker[];

      landmarkMarkersRef.current = newMarkers;
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.on('zoom', updateEmojiSize);
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
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.off('zoom', updateEmojiSize);
          } catch (error) {
            console.warn('Error removing zoom listener:', error);
          }
        }
      };
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
  }, [mapLoaded, landmarks]);

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