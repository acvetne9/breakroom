import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl';
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

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;

/ Add this helper function BEFORE the MapLibreMap component definition
const createGridSampling = (bounds: any, businesses: Business[], maxBusinesses: number) => {
  if (!businesses || businesses.length <= maxBusinesses) return businesses;
  
  // Create a grid to ensure even distribution
  const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 4)); // Adjust divisor to control density
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;
  
  const grid: Business[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null).map(() => []));
  
  // Distribute businesses into grid cells
  businesses.forEach(business => {
    if (!business?.position?.lat || !business?.position?.lng) return;
    
    const latIndex = Math.min(
      gridSize - 1,
      Math.max(0, Math.floor((business.position.lat - bounds.south) / latStep))
    );
    const lngIndex = Math.min(
      gridSize - 1,
      Math.max(0, Math.floor((business.position.lng - bounds.west) / lngStep))
    );
    
    grid[latIndex][lngIndex].push(business);
  });
  
  // Sample evenly from each cell
  const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize));
  const result: Business[] = [];
  
  grid.forEach(row => {
    row.forEach(cell => {
      if (cell.length > 0) {
        const sampled = cell
          .sort(() => Math.random() - 0.5) // Randomize
          .slice(0, businessesPerCell);
        result.push(...sampled);
      }
    });
  });
  
  return result.slice(0, maxBusinesses);
};

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
  
  // Global cache of all businesses we’ve loaded so far
  const [businessCache, setBusinessCache] = useState<Record<string, Business>>({});

  const mergeBusinessesIntoCache = useCallback((newBusinesses: Business[]) => {
    setBusinessCache(prev => {
      const updated = { ...prev };
      newBusinesses.forEach(b => {
        if (b && b.id) {
          updated[b.id] = b;
        }
      });
      return updated;
    });
  }, []);

  // Stable callback refs
  const onBusinessClickRef = useRef(onBusinessClick);
  const onMapLoadedRef = useRef(onMapLoaded);
  const onBusinessesLoadedRef = useRef(onBusinessesLoaded);
  
  useEffect(() => {
    onBusinessClickRef.current = onBusinessClick;
    onMapLoadedRef.current = onMapLoaded;
    onBusinessesLoadedRef.current = onBusinessesLoaded;
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // Initialize hooks with error handling
  let mapDataHook;
  let businessesHook;
  
  try {
    mapDataHook = useViewportMapData();
    businessesHook = useViewportBusinesses(searchFilters);
  } catch (error) {
    console.error('Error initializing hooks:', error);
    mapDataHook = { isProcessing: false, setIsProcessing: () => {}, loadAllDataCenterOut: () => {} };
    businessesHook = {
      businesses: [],
      loading: false,
      loadBusinessesInViewport: () => {},
      fetchFullBusinessDetails: () => Promise.resolve(null),
      isSearching: false
    };
  }

  const { isProcessing, setIsProcessing } = mapDataHook;
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    isSearching
  } = businessesHook;

  // Refs to prevent loops and track state
  const processedRef = useRef(false);
  const layersAddedRef = useRef(false);
  const isLoadingBusinessesRef = useRef(false);
  const lastSearchFiltersRef = useRef(searchFilters);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track last viewport to support refreshes
  const lastViewportRef = useRef<{ bounds: { north: number; south: number; east: number; west: number }; timestamp: number } | null>(null);


  // Calculate business limit based on zoom and viewport area for even distribution
  const getBusinessLimitForViewport = useCallback((zoom: number, bounds: any): number => {
    // Calculate viewport area
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = latKm * lngKm;
    
    // Target density based on zoom level for even distribution
    let targetDensity: number;
    if (zoom >= 16) targetDensity = 500;      // High zoom: many businesses
    else if (zoom >= 14) targetDensity = 250; // Medium zoom: moderate businesses
    else if (zoom >= 12) targetDensity = 100; // Lower zoom: fewer businesses
    else targetDensity = 50;                  // Far zoom: minimal businesses
    
    const targetBusinesses = Math.ceil(areaKm2 * targetDensity);
    const maxLimit = isMobile ? 5000 : 10000;
    const minLimit = 300;
    
    return Math.max(minLimit, Math.min(maxLimit, targetBusinesses));
  }, [isMobile]);

  // Business click handler
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

  
  // In the handleViewportChange function, replace the loadBusinessesInViewport call:
  const handleViewportChange = useCallback(async () => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingBusinessesRef.current) return;
  
    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const now = Date.now();
  
      const shouldRefreshPrevious =
        lastViewportRef.current &&
        (now - lastViewportRef.current.timestamp > 5000);
  
      const latDiff = bounds.getNorth() - bounds.getSouth();
      const lngDiff = bounds.getEast() - bounds.getWest();
      const expansion = 0.1;
  
      const expandedBounds = {
        north: bounds.getNorth() + latDiff * expansion,
        south: bounds.getSouth() - latDiff * expansion,
        east: bounds.getEast() + lngDiff * expansion,
        west: bounds.getWest() - lngDiff * expansion,
      };
  
      const businessLimit = getBusinessLimitForViewport(zoom, expandedBounds);
  
      console.log('🗺️ Loading businesses for viewport:', {
        zoom: zoom.toFixed(2),
        businessLimit,
        refreshingPrevious: shouldRefreshPrevious,
      });
  
      isLoadingBusinessesRef.current = true;
  
      // Load more businesses than needed for better distribution
      const rawBusinesses = await loadBusinessesInViewport(expandedBounds, businessLimit * 1.5);
      
      // Apply grid sampling for even distribution
      const distributedBusinesses = createGridSampling(expandedBounds, rawBusinesses || [], businessLimit);
      
      // Update the businesses state with evenly distributed results
      setBusinessCache(prev => {
        const updated = { ...prev };
        distributedBusinesses.forEach(b => {
          if (b && b.id) {
            updated[b.id] = b;
          }
        });
        return updated;
      });
  
      if (shouldRefreshPrevious && lastViewportRef.current) {
        setTimeout(() => {
          console.log('🔄 Background refresh of previous area');
          loadBusinessesInViewport(lastViewportRef.current!.bounds, businessLimit * 0.5);
        }, 1000);
      }
  
      lastViewportRef.current = { bounds: expandedBounds, timestamp: now };
  
      setTimeout(() => {
        isLoadingBusinessesRef.current = false;
      }, 1000);
    } catch (error) {
      console.error('Error in handleViewportChange:', error);
      isLoadingBusinessesRef.current = false;
    }
  }, [map, mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport]);

  // Create DeckGL layers
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
      
      const allBusinesses = Object.values(businessCache);

      return [createBusinessScatterplotLayer({
        businesses: allBusinesses,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
      })];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [businesses, selectedBusiness?.id, isClusteredData, handleBusinessClick]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || map) return;

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

    let mapInstance: maplibregl.Map;
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

    // Add safety wrapper for addLayer
    const originalAddLayer = mapInstance.addLayer.bind(mapInstance);
    mapInstance.addLayer = function (layerDef: any, before?: string) {
      try {
        const id = typeof layerDef === 'string' ? layerDef : layerDef?.id;
        if (id && this.getLayer && this.getLayer(id)) {
          console.log(`ℹ️ Layer "${id}" already exists, skipping.`);
          return;
        }
        return originalAddLayer(layerDef, before);
      } catch (err) {
        console.warn('⚠️ addLayer error:', err);
      }
    };

    mapInstance.on('load', () => {
      console.log('🗺️ Map loaded');
      setMapLoaded(true);
      if (onMapLoadedRef.current) {
        onMapLoadedRef.current();
      }
    });

    mapInstance.on('error', e => {
      console.error('🚨 Map error:', e.error);
    });
    
    // Add map layers when tiles are ready
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        console.log('🔄 NYC tiles loaded, adding layers...');
        
        try {
          const layersToAdd = [
            {
              id: 'nyc-land',
              type: 'fill' as const,
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
              paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
              filter: ['==', ['geometry-type'], 'Polygon']
            },
            {
              id: 'nyc-green-spaces',
              type: 'fill',
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
              paint: { 'fill-color': '#87C17A', 'fill-opacity': 1.0 },
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
              'source-layer': 'examplepoints',
              paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
              filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
            },
            {
              id: 'nyc-waterways',
              type: 'line' as const,
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
              paint: { 'line-color': '#999999', 'line-width': 1, 'line-opacity': 0.6 },
              filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
            },
            {
              id: 'nyc-roads',
              type: 'line' as const,
              source: 'nyc-tiles',
              'source-layer': 'examplepoints',
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
              'source-layer': 'examplepoints',
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
              mapInstance.addLayer(layer as any);
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

    setMap(mapInstance);

    return () => {
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        } finally {
          layersAddedRef.current = false;
          setMapLoaded(false);
          setMap(null);
        }
      }
    };
  }, []);

  // Initialize DeckGL overlay
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

  // Update DeckGL layers
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
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // Handle search filter changes
  useEffect(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport) return;
    
    const filtersChanged = JSON.stringify(lastSearchFiltersRef.current) !== JSON.stringify(searchFilters);
    if (!filtersChanged) return;
    
    console.log('🔍 Search filters changed:', searchFilters);
    lastSearchFiltersRef.current = searchFilters;
    isLoadingBusinessesRef.current = false;
    
    // Reload businesses with new filters
    setTimeout(() => handleViewportChange(), 100);
  }, [searchFilters, map, mapLoaded, loadBusinessesInViewport, handleViewportChange]);

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

  // Handle map movement
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const moveEndHandler = () => {
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      
      moveTimeoutRef.current = setTimeout(() => {
        handleViewportChange();
      }, 300);
    };
    
    map.on('moveend', moveEndHandler);
    map.on('zoomend', moveEndHandler);
    
    // Initial load
    setTimeout(() => {
      if (map && mapLoaded) {
        handleViewportChange();
      }
    }, 500);
    
    return () => {
      map.off('moveend', moveEndHandler);
      map.off('zoomend', moveEndHandler);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Notify when businesses are loaded
  useEffect(() => {
    if (businesses && businesses.length > 0) {
      mergeBusinessesIntoCache(businesses);
    }
  }, [businesses, mergeBusinessesIntoCache]);


  // Handle emoji landmarks
  useEffect(() => {
    if (!mapLoaded || !landmarks || !Array.isArray(landmarks) || !map) return;

    // Remove previous markers
    landmarkMarkersRef.current.forEach(marker => {
      try {
        marker.remove();
      } catch (error) {
        console.warn('Error removing marker:', error);
      }
    });
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    try {
      const updateEmojiSize = () => {
        const zoom = map.getZoom();
        const size = Math.max(12, Math.min(32, 16 * Math.pow(1.2, zoom - 10)));
        
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

      const newMarkers: maplibregl.Marker[] = landmarks.map(landmark => {
        const zoom = map.getZoom();
        const size = Math.max(12, Math.min(32, 16 * Math.pow(1.2, zoom - 10)));
        
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
          return new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([landmark.lng, landmark.lat])
            .addTo(map);
        } catch (error) {
          console.error('Error creating marker:', error);
          return null;
        }
      }).filter(Boolean) as maplibregl.Marker[];

      landmarkMarkersRef.current = newMarkers;
      map.on('zoom', updateEmojiSize);
      console.log(`Successfully added ${newMarkers.length} emoji markers`);

      return () => {
        landmarkMarkersRef.current.forEach(marker => {
          try {
            marker.remove();
          } catch (error) {
            console.warn('Error removing marker:', error);
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

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
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