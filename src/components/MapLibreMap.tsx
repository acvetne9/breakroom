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
  
  // IMPROVED: Better viewport tracking with adaptive thresholds
  const lastViewportRef = useRef<{
    bounds: any;
    zoom: number;
    timestamp: number;
    center: { lng: number; lat: number };
  } | null>(null);
  
  // IMPROVED: More sophisticated loading management
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingBusinessesRef = useRef(false);
  const pendingLoadRef = useRef(false);

  // NEW: Cached regions to avoid redundant loading
  const loadedRegionsRef = useRef<Set<string>>(new Set());
  const regionCacheTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // NEW: Generate region key for caching
  const getRegionKey = useCallback((bounds: any, zoom: number): string => {
    // Create grid-based regions for better caching
    const gridSize = zoom > 14 ? 0.005 : zoom > 12 ? 0.01 : 0.02;
    const gridLat = Math.floor(bounds.north / gridSize) * gridSize;
    const gridLng = Math.floor(bounds.east / gridSize) * gridSize;
    return `${gridLat.toFixed(4)}-${gridLng.toFixed(4)}-${Math.floor(zoom)}`;
  }, []);

  // NEW: Clear region cache periodically
  const clearRegionCache = useCallback(() => {
    loadedRegionsRef.current.clear();
    console.log('🧹 Cleared region cache');
  }, []);

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

  // IMPROVED: Smarter viewport change detection with adaptive loading
  const handleViewportChange = useCallback(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingBusinessesRef.current) return;

    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const center = map.getCenter();
      const now = Date.now();
      
      // IMPROVED: More sophisticated change detection
      if (lastViewportRef.current) {
        const timeDiff = now - lastViewportRef.current.timestamp;
        const zoomDiff = Math.abs(zoom - lastViewportRef.current.zoom);
        
        const lastBounds = lastViewportRef.current.bounds;
        const lastCenter = lastViewportRef.current.center;
        
        // Calculate movement distance and bounds overlap
        const centerDistance = Math.sqrt(
          Math.pow((center.lng - lastCenter.lng) * 111320 * Math.cos(center.lat * Math.PI / 180), 2) +
          Math.pow((center.lat - lastCenter.lat) * 111320, 2)
        );
        
        const boundsOverlap = Math.max(0, 
          Math.min(bounds.getNorth(), lastBounds.north) - Math.max(bounds.getSouth(), lastBounds.south)
        ) * Math.max(0,
          Math.min(bounds.getEast(), lastBounds.east) - Math.max(bounds.getWest(), lastBounds.west)
        );
        
        const totalArea = (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest());
        const overlapRatio = boundsOverlap / totalArea;
        
        // IMPROVED: Adaptive thresholds based on zoom level and movement type
        const minDistance = zoom > 15 ? 50 : zoom > 13 ? 100 : 200; // meters
        const minOverlapRatio = zoom > 15 ? 0.6 : zoom > 13 ? 0.7 : 0.8;
        const minTimeDiff = isMovingRef.current ? 200 : 500;
        
        // Skip loading if:
        // 1. Not much movement AND good overlap AND recent load
        // 2. OR very recent load (< 200ms) regardless of movement
        if (
          (centerDistance < minDistance && overlapRatio > minOverlapRatio && timeDiff < 2000) ||
          (timeDiff < minTimeDiff)
        ) {
          console.log('🔄 Skipping viewport update - insufficient change', {
            distance: Math.round(centerDistance),
            overlap: Math.round(overlapRatio * 100),
            timeDiff
          });
          return;
        }
      }
      
      // IMPROVED: Expand viewport bounds for preloading
      const expandFactor = isMovingRef.current ? 1.5 : 1.2; // Load more when moving
      const latDiff = bounds.getNorth() - bounds.getSouth();
      const lngDiff = bounds.getEast() - bounds.getWest();
      const expansion = {
        lat: latDiff * (expandFactor - 1) / 2,
        lng: lngDiff * (expandFactor - 1) / 2
      };
      
      const expandedBounds = {
        north: bounds.getNorth() + expansion.lat,
        south: bounds.getSouth() - expansion.lat,
        east: bounds.getEast() + expansion.lng,
        west: bounds.getWest() - expansion.lng
      };

      // Check if this region was recently loaded
      const regionKey = getRegionKey(expandedBounds, zoom);
      if (loadedRegionsRef.current.has(regionKey) && lastViewportRef.current && 
          now - lastViewportRef.current.timestamp < 5000) {
        console.log('🔄 Skipping - region recently loaded:', regionKey);
        return;
      }

      // Update tracking
      lastViewportRef.current = {
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        zoom,
        timestamp: now,
        center: { lng: center.lng, lat: center.lat }
      };

      // Mark region as loaded
      loadedRegionsRef.current.add(regionKey);

      console.log('🗺️ Loading businesses for expanded viewport:', {
        original: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        expanded: expandedBounds,
        expansion: expandFactor
      });
      
      // IMPROVED: Dynamic business limits based on zoom and movement
      const baseLimitMobile = 15000;
      const baseLimitDesktop = 30000;
      const zoomMultiplier = zoom > 15 ? 1.5 : zoom > 13 ? 1.2 : 1.0;
      const movementMultiplier = isMovingRef.current ? 1.3 : 1.0;
      
      const businessLimit = Math.floor(
        (isMobile ? baseLimitMobile : baseLimitDesktop) * 
        zoomMultiplier * 
        movementMultiplier
      );
      
      // Set loading flag to prevent concurrent calls
      isLoadingBusinessesRef.current = true;
      
      // Clear any existing timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      loadBusinessesInViewport(expandedBounds, businessLimit, isMovingRef.current);
      
      // Reset loading flag after a delay
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingBusinessesRef.current = false;
      }, 800);
      
      setCurrentZoom(zoom);
    } catch (error) {
      console.error('Error in handleViewportChange:', error);
      isLoadingBusinessesRef.current = false;
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport, getRegionKey]);

  // NEW: Predictive loading for smooth panning
  const handlePredictiveLoad = useCallback((direction: 'north' | 'south' | 'east' | 'west') => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingBusinessesRef.current) return;
    
    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const latDiff = bounds.getNorth() - bounds.getSouth();
      const lngDiff = bounds.getEast() - bounds.getWest();
      
      // Create bounds for the adjacent area in the movement direction
      let predictiveBounds;
      switch (direction) {
        case 'north':
          predictiveBounds = {
            north: bounds.getNorth() + latDiff * 0.8,
            south: bounds.getNorth() - latDiff * 0.2,
            east: bounds.getEast(),
            west: bounds.getWest()
          };
          break;
        case 'south':
          predictiveBounds = {
            north: bounds.getSouth() + latDiff * 0.2,
            south: bounds.getSouth() - latDiff * 0.8,
            east: bounds.getEast(),
            west: bounds.getWest()
          };
          break;
        case 'east':
          predictiveBounds = {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast() + lngDiff * 0.8,
            west: bounds.getEast() - lngDiff * 0.2
          };
          break;
        case 'west':
          predictiveBounds = {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getWest() + lngDiff * 0.2,
            west: bounds.getWest() - lngDiff * 0.8
          };
          break;
        default:
          return;
      }
      
      const regionKey = getRegionKey(predictiveBounds, zoom);
      if (!loadedRegionsRef.current.has(regionKey)) {
        console.log(`🔮 Predictive loading ${direction}:`, predictiveBounds);
        const businessLimit = isMobile ? 8000 : 15000; // Smaller limit for predictive loading
        loadBusinessesInViewport(predictiveBounds, businessLimit, true);
        loadedRegionsRef.current.add(regionKey);
      }
    } catch (error) {
      console.error('Error in predictive loading:', error);
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport, getRegionKey]);

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

    // IMPROVED: Enhanced movement tracking with direction detection
    let lastCenter: { lng: number; lat: number } | null = null;
    let moveStartTime = 0;
    
    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
      moveStartTime = Date.now();
      lastCenter = mapInstance!.getCenter();
      
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    });

    // NEW: Detect movement direction for predictive loading (with safety checks)
    mapInstance.on('move', () => {
      if (!lastCenter || !isMovingRef.current || !mapInstance) return;
      
      try {
        const currentCenter = mapInstance.getCenter();
        const latDiff = currentCenter.lat - lastCenter.lat;
        const lngDiff = currentCenter.lng - lastCenter.lng;
        
        // Only trigger predictive loading if we have the required functions
        if (typeof handlePredictiveLoad === 'function') {
          // Determine primary movement direction
          if (Math.abs(latDiff) > Math.abs(lngDiff)) {
            if (latDiff > 0.001) handlePredictiveLoad('north');
            else if (latDiff < -0.001) handlePredictiveLoad('south');
          } else {
            if (lngDiff > 0.001) handlePredictiveLoad('east');
            else if (lngDiff < -0.001) handlePredictiveLoad('west');
          }
        }
        
        lastCenter = currentCenter;
      } catch (error) {
        console.warn('Error in move handler:', error);
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
  }, []); // Removed handlePredictiveLoad dependency

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

  // IMPROVED: Search filter handling with cache invalidation
  useEffect(() => {
    if (!map || !mapLoaded || !loadBusinessesInViewport) return;
    
    // Deep comparison for search filters
    const filtersChanged = JSON.stringify(lastSearchFiltersRef.current) !== JSON.stringify(searchFilters);
    if (!filtersChanged) return;
    
    console.log('🔍 Search filters changed:', searchFilters);
    lastSearchFiltersRef.current = searchFilters;
    
    // Clear all caches when filters change
    clearRegionCache();
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
      const businessLimit = isMobile ? 15000 : 30000;
      loadBusinessesInViewport(viewportBounds, businessLimit, false);
    } catch (e) {
      console.warn('⚠️ Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport, clearRegionCache]);

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
      // Clear region cache when jumping to new neighborhood
      clearRegionCache();
      
      map.easeTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 14,
        duration: 1000
      });
    } catch (error) {
      console.error('Error centering on neighborhood:', error);
    }
  }, [neighborhoodCenter, map, mapLoaded, clearRegionCache]);

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

  // IMPROVED: More responsive movement handlers
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const moveEndHandler = () => {
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      
      // Shorter debounce for more responsive loading
      moveTimeoutRef.current = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300); // Reduced from 500ms for faster response
    };
    
    // NEW: Also handle zoom changes immediately
    const zoomEndHandler = () => {
      if (!isMovingRef.current) {
        // Clear region cache on significant zoom changes
        const currentZoom = map.getZoom();
        if (lastViewportRef.current && Math.abs(currentZoom - lastViewportRef.current.zoom) > 1) {
          clearRegionCache();
        }
        handleViewportChange();
      }
    };
    
    map.on('moveend', moveEndHandler);
    map.on('zoomend', zoomEndHandler);
    
    // Initial load with delay to prevent immediate double calls
    setTimeout(() => {
      if (map && mapLoaded) {
        handleViewportChange();
      }
    }, 1000);
    
    return () => {
      map.off('moveend', moveEndHandler);
      map.off('zoomend', zoomEndHandler);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, [map, mapLoaded, handleViewportChange, clearRegionCache]);

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

  // NEW: Periodic cache cleanup
  useEffect(() => {
    // Clear region cache every 5 minutes to prevent memory buildup
    regionCacheTimeoutRef.current = setInterval(() => {
      clearRegionCache();
    }, 5 * 60 * 1000);

    return () => {
      if (regionCacheTimeoutRef.current) {
        clearInterval(regionCacheTimeoutRef.current);
      }
    };
  }, [clearRegionCache]);

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
      if (regionCacheTimeoutRef.current) {
        clearInterval(regionCacheTimeoutRef.current);
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