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

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface ViewportState {
  bounds: Bounds;
  zoom: number;
  timestamp: number;
}

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;

// Optimized grid sampling with better distribution
const createOptimizedGridSampling = (bounds: Bounds, businesses: Business[], maxBusinesses: number): Business[] => {
  if (!businesses || businesses.length <= maxBusinesses) return businesses;

  const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 2));
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;

  const grid = Array.from({ length: gridSize }, () => 
    Array.from({ length: gridSize }, () => [] as Business[])
  );

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

  // Sample evenly from each cell with simple randomization
  const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize));
  const result: Business[] = [];

  grid.forEach(row => {
    row.forEach(cell => {
      if (cell.length === 0) return;

      // Simple randomization to avoid complex sorting
      const shuffled = cell.sort(() => Math.random() - 0.5);
      result.push(...shuffled.slice(0, businessesPerCell));
    });
  });

  return result.slice(0, maxBusinesses);
};

// Simple business cache with LRU-like behavior
class BusinessCache {
  private cache = new Map<string, Business & { detailsLoaded?: boolean }>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  set(id: string, business: Business & { detailsLoaded?: boolean }) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entries
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxSize * 0.1));
      keysToDelete.forEach(key => this.cache.delete(key));
    }
    this.cache.set(id, business);
  }

  get(id: string): (Business & { detailsLoaded?: boolean }) | undefined {
    const business = this.cache.get(id);
    if (business) {
      // Move to end (most recently used)
      this.cache.delete(id);
      this.cache.set(id, business);
    }
    return business;
  }

  getAll(): (Business & { detailsLoaded?: boolean })[] {
    return Array.from(this.cache.values());
  }

  addMultiple(businesses: Business[]) {
    businesses.forEach(b => {
      if (b?.id) this.set(b.id, b);
    });
  }

  clear() {
    this.cache.clear();
  }
}

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
  
  // Refs for stable references and state tracking
  const businessCacheRef = useRef(new BusinessCache(isMobile ? 5000 : 10000));
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastViewportRef = useRef<ViewportState | null>(null);
  const lastSearchFiltersRef = useRef(searchFilters);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable callback refs
  const callbackRefs = useRef({
    onBusinessClick,
    onMapLoaded,
    onBusinessesLoaded
  });

  useEffect(() => {
    callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded };
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // Initialize hooks with error handling
  const hooks = useMemo(() => {
    try {
      const mapDataHook = useViewportMapData();
      const businessesHook = useViewportBusinesses(searchFilters);
      return { mapDataHook, businessesHook };
    } catch (error) {
      console.error('Error initializing hooks:', error);
      return {
        mapDataHook: { 
          isProcessing: false, 
          setIsProcessing: () => {},
          loadAllDataCenterOut: () => {} 
        },
        businessesHook: {
          businesses: [],
          loading: false,
          loadBusinessesInViewport: () => Promise.resolve([]),
          fetchFullBusinessDetails: () => Promise.resolve(null),
          isSearching: false
        }
      };
    }
  }, [searchFilters]);

  const { isProcessing, setIsProcessing } = hooks.mapDataHook;
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    isSearching
  } = hooks.businessesHook;

  // Optimized business limit calculation
  const getBusinessLimitForViewport = useCallback((zoom: number, bounds: Bounds): number => {
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    
    // Calculate viewport area in km²
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = latKm * lngKm;
    
    // Adaptive density based on zoom level
    let baseDensity: number;
    if (zoom >= 16) baseDensity = 300;
    else if (zoom >= 14) baseDensity = 150;
    else if (zoom >= 12) baseDensity = 80;
    else baseDensity = 40;
    
    // Adjust for mobile performance
    const mobileFactor = isMobile ? 0.7 : 1.0;
    const targetBusinesses = Math.ceil(areaKm2 * baseDensity * mobileFactor);
    
    const maxLimit = isMobile ? 3000 : 6000;
    const minLimit = 200;
    
    return Math.max(minLimit, Math.min(maxLimit, targetBusinesses));
  }, [isMobile]);

  // Optimized business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !callbackRefs.current.onBusinessClick) return;
    
    try {
      let businessToReturn = business;
      
      if (business.id && !business.id.startsWith('vector_') && fetchFullBusinessDetails) {
        const cached = businessCacheRef.current.get(business.id);
        if (cached && cached.detailsLoaded) {
          businessToReturn = cached;
        } else {
          const fullBusiness = await fetchFullBusinessDetails(business.id);
          if (fullBusiness) {
            const extendedBusiness = { ...fullBusiness, detailsLoaded: true };
            businessCacheRef.current.set(business.id, extendedBusiness);
            businessToReturn = extendedBusiness;
          }
        }
      }
      
      callbackRefs.current.onBusinessClick(businessToReturn);
    } catch (error) {
      console.warn('Error in handleBusinessClick:', error);
      callbackRefs.current.onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails]);

  // Debounced viewport change handler
  const handleViewportChange = useCallback(async () => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingRef.current) return;

    // Debounce rapid viewport changes
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        isLoadingRef.current = true;
        
        const bounds = map.getBounds();
        const zoom = map.getZoom();
        const now = Date.now();

        // Check if we need to refresh previous viewport
        const shouldRefreshPrevious = lastViewportRef.current && 
          (now - lastViewportRef.current.timestamp > 8000) &&
          Math.abs(zoom - lastViewportRef.current.zoom) < 2;

        // Create expanded bounds for buffer loading
        const latDiff = bounds.getNorth() - bounds.getSouth();
        const lngDiff = bounds.getEast() - bounds.getWest();
        const expansion = Math.min(0.1, Math.max(0.03, 1 / zoom)); // Adaptive expansion

        const expandedBounds: Bounds = {
          north: bounds.getNorth() + latDiff * expansion,
          south: bounds.getSouth() - latDiff * expansion,
          east: bounds.getEast() + lngDiff * expansion,
          west: bounds.getWest() - lngDiff * expansion,
        };

        const businessLimit = getBusinessLimitForViewport(zoom, expandedBounds);
        
        console.log('🗺️ Loading businesses:', {
          zoom: zoom.toFixed(2),
          businessLimit,
          cacheSize: businessCacheRef.current.getAll().length
        });

        // Load businesses with buffer
        const rawBusinesses = await loadBusinessesInViewport(expandedBounds, Math.floor(businessLimit * 1.3));

        if (!rawBusinesses || !Array.isArray(rawBusinesses) || rawBusinesses.length === 0) {
          console.log('No businesses loaded for viewport');
          return;
        }

        // Separate visible and buffer businesses
        const visibleBounds: Bounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        };

        const visible: Business[] = [];
        const buffer: Business[] = [];

        rawBusinesses.forEach((b: Business) => {
          if (!b?.position) return;
          
          const isVisible = b.position.lat <= visibleBounds.north &&
            b.position.lat >= visibleBounds.south &&
            b.position.lng <= visibleBounds.east &&
            b.position.lng >= visibleBounds.west;
          
          if (isVisible) {
            visible.push(b);
          } else {
            buffer.push(b);
          }
        });

        // Apply optimized sampling
        const visibleSampled = createOptimizedGridSampling(visibleBounds, visible, Math.floor(businessLimit * 0.8));
        const bufferSampled = createOptimizedGridSampling(expandedBounds, buffer, Math.floor(businessLimit * 0.2));

        const finalBusinesses = [...visibleSampled, ...bufferSampled];

        // Update cache
        businessCacheRef.current.addMultiple(finalBusinesses);

        // Store current viewport state
        lastViewportRef.current = { bounds: expandedBounds, zoom, timestamp: now };

        // Background refresh of previous area if needed
        if (shouldRefreshPrevious && lastViewportRef.current && loadBusinessesInViewport) {
          setTimeout(() => {
            if (lastViewportRef.current && loadBusinessesInViewport) {
              loadBusinessesInViewport(lastViewportRef.current.bounds, Math.floor(businessLimit * 0.3));
            }
          }, 2000);
        }

      } catch (error) {
        console.error('Error in handleViewportChange:', error);
      } finally {
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 500);
      }
    }, 300); // Debounce delay

  }, [map, mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport]);

  // Memoized DeckGL layers with better caching
  const deckGLLayers = useMemo(() => {
    const cachedBusinesses = businessCacheRef.current.getAll();
    
    if (!cachedBusinesses || cachedBusinesses.length === 0) return [];

    try {
      let businessesToRender = cachedBusinesses;
      
      // Handle clustered data efficiently
      if (isClusteredData && businesses && businesses.length > 0) {
        const flattenedBusinesses: Business[] = [];
        businesses.forEach((item: any) => {
          if (item?.type === 'cluster' && item.businesses) {
            item.businesses.forEach((b: Business) => {
              if (b?.position) flattenedBusinesses.push(b);
            });
          } else if (item?.type !== 'cluster' && item?.position) {
            flattenedBusinesses.push(item);
          }
        });
        businessesToRender = flattenedBusinesses;
      }

      return [createBusinessScatterplotLayer({
        businesses: businessesToRender,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
      })];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [selectedBusiness?.id, isClusteredData, businesses, handleBusinessClick]);

  // Initialize map with optimized configuration
  useEffect(() => {
    if (!mapRef.current || map) return;

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    
    const mapStyle = {
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

    const mapInstance = new maplibregl.Map({
      container: mapRef.current!,
      style: mapStyle,
      center: [-73.986104, 40.715245],
      zoom: 12.77,
      maxZoom: 18,
      minZoom: 9,
      renderWorldCopies: false,
      attributionControl: false
    });
    
    mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

    // Enhanced error handling
    mapInstance.on('error', (e) => {
      console.error('🚨 Map error:', e.error);
    });

    mapInstance.on('load', () => {
      console.log('🗺️ Map loaded');
      setMapLoaded(true);
      callbackRefs.current.onMapLoaded?.();
    });

    // Optimized move handlers
    const debouncedMoveHandler = (() => {
      let timeout: NodeJS.Timeout;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(handleViewportChange, 150);
      };
    })();

    mapInstance.on('moveend', handleViewportChange);
    mapInstance.on('zoomend', handleViewportChange);
    mapInstance.on('move', debouncedMoveHandler);

    // Add map layers when ready
    mapInstance.on('sourcedata', (e) => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        console.log('🔄 Adding NYC layers...');
        
        const layers = [
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
            type: 'fill' as const,
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
            id: 'nyc-roads',
            type: 'line' as const,
            source: 'nyc-tiles',
            'source-layer': 'examplepoints',
            paint: {
              'line-color': '#666666',
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
              'line-opacity': 0.8
            },
            filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
          }
        ];

        layers.forEach(layer => {
          try {
            if (!mapInstance.getLayer(layer.id)) {
              mapInstance.addLayer(layer as any);
            }
          } catch (error) {
            console.warn(`Failed to add layer ${layer.id}:`, error);
          }
        });
        
        layersAddedRef.current = true;
        console.log('✅ NYC layers added');
      }
    });

    setMap(mapInstance);

    return () => {
      // Cleanup
      [updateTimeoutRef, moveTimeoutRef, debounceTimeoutRef].forEach(ref => {
        if (ref.current) clearTimeout(ref.current);
      });
      
      landmarkMarkersRef.current.forEach(marker => {
        try { marker.remove(); } catch {}
      });
      
      try {
        mapInstance.remove();
      } catch (error) {
        console.error('Error removing map:', error);
      }
      
      businessCacheRef.current.clear();
      layersAddedRef.current = false;
      setMapLoaded(false);
      setMap(null);
    };
  }, [handleViewportChange]);

  // Initialize DeckGL overlay
  useEffect(() => {
    if (!map || !mapLoaded || deckOverlay) return;
    
    let overlay = overlayInstance;
    if (!overlay) {
      overlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      });
      overlayInstance = overlay;
    }
    
    try {
      map.addControl(overlay as any);
      setDeckOverlay(overlay);
      setOverlayReady(true);
    } catch (e) {
      console.log('DeckGL overlay already added:', e);
      setOverlayReady(true);
    }
  }, [map, mapLoaded]);

  // Update DeckGL layers with throttling
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    
    updateTimeoutRef.current = setTimeout(() => {
      try {
        deckOverlay.setProps({ layers: deckGLLayers });
        console.log(`🎯 Updated DeckGL with ${deckGLLayers.length} layers`);
      } catch (error) {
        console.error('Error updating DeckGL:', error);
      }
    }, 50);
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // Handle search filter changes
  useEffect(() => {
    const filtersChanged = JSON.stringify(lastSearchFiltersRef.current) !== JSON.stringify(searchFilters);
    if (!filtersChanged || !map || !mapLoaded) return;
    
    console.log('🔍 Search filters changed, clearing cache');
    lastSearchFiltersRef.current = searchFilters;
    businessCacheRef.current.clear();
    isLoadingRef.current = false;
    
    setTimeout(handleViewportChange, 100);
  }, [searchFilters, map, mapLoaded, handleViewportChange]);

  // Handle business updates
  useEffect(() => {
    if (businesses && businesses.length > 0) {
      businessCacheRef.current.addMultiple(businesses);
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  // Zoom to selected business
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 600
    });
  }, [selectedBusiness?.id, map, mapLoaded]);

  // Center on neighborhood
  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;
    
    map.easeTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 800
    });
  }, [neighborhoodCenter, map, mapLoaded]);

  // Handle landmarks with performance optimization
  useEffect(() => {
    if (!mapLoaded || !landmarks?.length || !map) return;

    // Clear existing markers
    landmarkMarkersRef.current.forEach(marker => {
      try { marker.remove(); } catch {}
    });
    landmarkMarkersRef.current = [];

    const zoom = map.getZoom();
    const size = Math.max(12, Math.min(32, 16 * Math.pow(1.15, zoom - 10)));

    const markers = landmarks.map(landmark => {
      const el = document.createElement('div');
      el.textContent = landmark.emoji;
      el.style.cssText = `
        font-size: ${size}px;
        line-height: ${size}px;
        width: ${size}px;
        height: ${size}px;
        user-select: none;
        pointer-events: none;
        text-shadow: 0 0 3px rgba(255,255,255,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 0;
      `;

      try {
        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
      } catch (error) {
        console.error('Error creating marker:', error);
        return null;
      }
    }).filter(Boolean) as maplibregl.Marker[];

    landmarkMarkersRef.current = markers;

    // Optimized zoom handler for emoji sizing
    const handleZoomChange = () => {
      const newZoom = map.getZoom();
      const newSize = Math.max(12, Math.min(32, 16 * Math.pow(1.15, newZoom - 10)));
      
      markers.forEach(marker => {
        const element = marker.getElement();
        if (element) {
          element.style.fontSize = `${newSize}px`;
          element.style.lineHeight = `${newSize}px`;
          element.style.width = `${newSize}px`;
          element.style.height = `${newSize}px`;
        }
      });
    };

    map.on('zoom', handleZoomChange);

    return () => {
      try { map.off('zoom', handleZoomChange); } catch {}
    };
  }, [mapLoaded, landmarks, map]);

  // Initial viewport load
  useEffect(() => {
    if (mapLoaded && map) {
      setTimeout(handleViewportChange, 800);
    }
  }, [mapLoaded, map, handleViewportChange]);

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