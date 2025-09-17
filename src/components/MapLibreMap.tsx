import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { createTileBlobUrl } from '@/utils/tileDecompression';
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

// Optimized grid sampling with visible area priority
const createOptimizedGridSampling = (bounds: Bounds, businesses: Business[], maxBusinesses: number, prioritizeVisible: boolean = false): Business[] => {
  if (!businesses || businesses.length <= maxBusinesses) return businesses;

  // If prioritizing visible area, be less aggressive with sampling
  if (prioritizeVisible) {
    console.log(`🎯 Prioritizing visible area sampling: ${businesses.length} -> ${maxBusinesses} businesses`);
    
    // For visible area, use a larger grid to keep more businesses
    const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 1.5)); // Less aggressive grid
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

    // Sample more generously from each cell for visible area
    const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize * 0.7)); // More per cell
    const result: Business[] = [];

    grid.forEach(row => {
      row.forEach(cell => {
        if (cell.length === 0) return;
        // Take more businesses from each cell for visible area
        result.push(...cell.slice(0, businessesPerCell));
      });
    });

    return result.slice(0, maxBusinesses);
  }

  // Original logic for buffer areas
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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  
  // Refs for stable references and state tracking
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const businessCacheRef = useRef(new BusinessCache(isMobile ? 10000 : 20000));
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

  // Ref to always call the latest viewport handler without re-binding listeners
  const handleViewportChangeRef = useRef<() => void>(() => {});

  useEffect(() => {
    callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded };
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // Initialize hooks (must be called unconditionally at top level)
  const mapDataHook = useViewportMapData();
  const businessesHook = useViewportBusinesses(searchFilters);

  const { isProcessing, setIsProcessing } = mapDataHook;
  const { 
    businesses: rawBusinesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    isSearching
  } = businessesHook;

  // Ensure businesses is always an array to prevent dependency array crashes
  const businesses = Array.isArray(rawBusinesses) ? rawBusinesses : [];
  
  // Log businesses for debugging and ensure they get cached
  useEffect(() => {
    console.log(`🎯 MapLibreMap received ${businesses.length} businesses:`, {
      searchFilters: !!searchFilters,
      hasNeighborhoodFilter: !!searchFilters?.neighborhoodFilter,
      businessNames: businesses.slice(0, 5).map(b => b.name)
    });

    // CRITICAL: Add businesses from hook to cache so DeckGL can render them
    if (businesses && businesses.length > 0) {
      console.log(`🏪 Adding ${businesses.length} businesses to cache for DeckGL rendering`);
      businessCacheRef.current.addMultiple(businesses);
      console.log(`💾 Cache now contains ${businessCacheRef.current.getAll().length} businesses`);
    }
  }, [businesses, searchFilters]);

  // Function to add vector layers
  const addVectorLayers = useCallback((map: maplibregl.Map) => {
    try {
      const layers = [
        {
          id: 'nyc-land',
          type: 'fill' as const,
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {},
          paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
          filter: ['==', ['geometry-type'], 'Polygon'] as any
        },
        {
          id: 'nyc-green-spaces',
          type: 'fill' as const,
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {},
          paint: { 'fill-color': '#87C17A', 'fill-opacity': 1.0 },
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['any',
              ['==', ['get', 'leisure'], 'park'],
              ['==', ['get', 'landuse'], 'cemetery'],
              ['==', ['get', 'amenity'], 'cemetery'],
              ['==', ['get', 'amenity'], 'grave_yard'],
              ['==', ['get', 'landuse'], 'recreation_ground'],
              ['==', ['get', 'leisure'], 'recreation_ground'],
              ['in', 'cemetery', ['get', 'name']],
              ['in', 'Cemetery', ['get', 'name']],
              ['in', 'Graveyard', ['get', 'name']],
              ['in', 'graveyard', ['get', 'name']],
              ['==', ['get', 'place'], 'cemetery'],
              ['==', ['get', 'historic'], 'cemetery']
            ]
          ] as any
        },
        {
          id: 'nyc-water',
          type: 'fill' as const,
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {},
          paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']] as any
        },
        {
          id: 'nyc-roads',
          type: 'line' as const,
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {},
          paint: {
            'line-color': '#666666',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
            'line-opacity': 0.8
          },
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']] as any
        },
        {
          id: 'nyc-road-labels',
          type: 'symbol' as const,
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 12],
            'text-max-width': 8,
            'text-line-height': 1.2,
            'symbol-placement': 'line',
            'text-rotation-alignment': 'map',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#333333',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1]
          },
          filter: [
            'all', 
            ['==', ['geometry-type'], 'LineString'], 
            ['has', 'name'],
            ['has', 'highway'],
            ['!=', ['get', 'name'], '']
          ] as any,
          minzoom: 12
        }
      ];

      console.log('Adding', layers.length, 'vector layers...');
      
      layers.forEach((layer, index) => {
        try {
          if (!map.getLayer(layer.id)) {
            map.addLayer(layer as any);
            console.log(`Added layer ${index + 1}/${layers.length}: ${layer.id}`);
          }
        } catch (error) {
          console.error('Error adding layer:', layer.id, error);
        }
      });

      layersAddedRef.current = true;
      console.log('All vector layers added successfully');
    } catch (error) {
      console.error('Error in addVectorLayers:', error);
    }
  }, []);

  // Optimized business limit calculation
  const getBusinessLimitForViewport = useCallback((zoom: number, bounds: Bounds): number => {
    if (!bounds) return 200;
    
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    
    // Calculate viewport area in km²
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = latKm * lngKm;
    
    // Adaptive density based on zoom level
    let baseDensity: number;
    if (zoom >= 16) baseDensity = 500;
    else if (zoom >= 14) baseDensity = 250;
    else if (zoom >= 12) baseDensity = 150;
    else baseDensity = 80;
    
    // Adjust for mobile performance
    const mobileFactor = isMobile ? 0.8 : 1.0;
    const targetBusinesses = Math.ceil(areaKm2 * baseDensity * mobileFactor);
    
    const maxLimit = isMobile ? 20000 : 40000;
    const minLimit = 5000;
    
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
    if (!mapRef.current || !mapLoaded || isLoadingRef.current) {
      console.log('🚫 Viewport change skipped:', {
        hasMap: !!mapRef.current,
        mapLoaded,
        isLoading: isLoadingRef.current
      });
      return;
    }

    const map = mapRef.current;

    if (searchFilters?.neighborhoodFilter?.boundary?.length > 0) {
      const { boundary, name } = searchFilters.neighborhoodFilter;
      console.log("📍 Loading businesses within neighborhood polygon:", name);
    
      // Convert boundary points to [lng, lat] for polygon
      const polygon: [number, number][] = boundary.map(p => [p.lon, p.lat]);
    
      // Pass polygon directly to your fetch
      const neighborhoodBusinesses = await loadBusinessesInViewport(polygon, businessLimit);
    
      businessCacheRef.current.addMultiple(neighborhoodBusinesses);
      return; // ✅ do not fall back to rectangular viewport fetch
    }

  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport, searchFilters]);

  // Memoized DeckGL layers calculation with detailed logging
  const deckGLLayers = useMemo(() => {
    try {
      // Get all businesses from cache
      const cachedBusinesses = businessCacheRef.current.getAll();
      
      // Get businesses from hook
      const hookBusinesses = businesses || [];
      
      // Combine and deduplicate businesses
      const allBusinesses = [...cachedBusinesses];
      hookBusinesses.forEach(hookBusiness => {
        if (!allBusinesses.some(cached => cached.id === hookBusiness.id)) {
          allBusinesses.push(hookBusiness);
        }
      });

      console.log(`🎯 DeckGL layers calculation:`, {
        cachedBusinessesCount: cachedBusinesses.length,
        hookBusinessesCount: hookBusinesses.length,
        finalBusinessesCount: allBusinesses.length,
        mapLoaded,
        hasMap: !!mapRef.current,
        containerDimensions: mapContainerRef.current ? {
          width: mapContainerRef.current.clientWidth,
          height: mapContainerRef.current.clientHeight
        } : null
      });

      if (allBusinesses.length === 0) {
        console.log('❌ No businesses available for DeckGL layers (cache + hook)');
        return [];
      }

      let businessesToRender = allBusinesses.filter(business => 
        business && 
        business.position && 
        typeof business.position.lat === 'number' && 
        typeof business.position.lng === 'number' &&
        !isNaN(business.position.lat) && 
        !isNaN(business.position.lng)
      );

      // Filter businesses to current viewport if map is loaded
      if (mapRef.current && mapLoaded) {
        const currentBounds = mapRef.current.getBounds();
        let visibleBusinesses = businessesToRender;

        if (searchFilters?.neighborhoodFilter?.boundary?.length > 0) {
          const polyCoords = searchFilters.neighborhoodFilter.boundary.map(p => [p.lon, p.lat]);
          const turfPoly = turfPolygon([polyCoords]);
          visibleBusinesses = businessesToRender.filter(b => {
            const p = turfPoint([b.position.lng, b.position.lat]);
            return booleanPointInPolygon(p, turfPoly);
          });
        }
        
        // Combine visible businesses with some cached ones for smooth scrolling
        const bufferBusinesses = businessesToRender.filter(business => {
          if (!business?.position?.lat || !business?.position?.lng) return false;
          
          const latBuffer = (currentBounds.getNorth() - currentBounds.getSouth()) * 0.2;
          const lngBuffer = (currentBounds.getEast() - currentBounds.getWest()) * 0.2;
          
          return business.position.lat <= currentBounds.getNorth() + latBuffer &&
                 business.position.lat >= currentBounds.getSouth() - latBuffer &&
                 business.position.lng <= currentBounds.getEast() + lngBuffer &&
                 business.position.lng >= currentBounds.getWest() - lngBuffer;
        });
        
        // Prioritize visible businesses, add some buffer ones
        businessesToRender = [...visibleBusinesses, ...bufferBusinesses.slice(0, 1000)];
        
        // Remove duplicates
        const seen = new Set();
        businessesToRender = businessesToRender.filter(business => {
          if (seen.has(business.id)) return false;
          seen.add(business.id);
          return true;
        });
        
        console.log(`🎯 Rendering ${visibleBusinesses.length} visible + ${bufferBusinesses.length - visibleBusinesses.length} buffer businesses`);
      }

      console.log(`✅ Creating DeckGL layer with ${businessesToRender.length} businesses`);
      
      return [createBusinessScatterplotLayer({
        businesses: businessesToRender,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
      })];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [businesses, selectedBusiness?.id, isClusteredData, handleBusinessClick, mapLoaded]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // run once
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize map once - CRITICAL: Empty deps to prevent re-initialization
  useEffect(() => {
    const initializeMap = async () => {
      console.log('🔄 MapLibre initialization starting - SHOULD ONLY RUN ONCE', { 
        hasContainer: !!mapContainerRef.current, 
        hasMap: !!mapRef.current,
        containerDimensions: mapContainerRef.current ? {
          width: mapContainerRef.current.clientWidth,
          height: mapContainerRef.current.clientHeight
        } : null
      });
      
      // Prevent multiple initializations
      if (!mapContainerRef.current || mapRef.current) {
        console.log('🚫 Skipping map initialization - already exists or no container');
        return;
      }

      // Ensure container has minimum dimensions
      const container = mapContainerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      console.log('🔧 Container dimensions check:', { containerWidth, containerHeight });
      
      if (containerWidth < 100 || containerHeight < 100) {
        console.warn('⚠️ Container too small, waiting for proper sizing:', { containerWidth, containerHeight });
        return;
      }

      console.log('🔧 Web environment detected, using vector tiles with service worker...');

      // Create tile source - use direct URLs since blob URLs are causing parsing issues
      const createTileSource = () => {
        console.log('🔧 Using direct vector tiles for web environment');
        const fullUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
        console.log('🔧 Tile URL template:', fullUrl);
        
        return {
          type: 'vector' as const,
          tiles: [fullUrl],
          minzoom: 10,
          maxzoom: 16,
          scheme: 'xyz' as const
        };
      };

      const vectorSource = createTileSource();
      
      const mapStyle = {
        version: 8 as const,
        sources: {
          'nyc-tiles': vectorSource
        },
        // Remove glyphs to prevent DataCloneError and font loading crashes
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#F5F5DC' }
          }
        ]
      };

      console.log('🗺️ Creating MapLibre instance with style:', {
        version: mapStyle.version,
        sourceCount: Object.keys(mapStyle.sources).length,
        sources: Object.keys(mapStyle.sources),
        layerCount: mapStyle.layers.length
      });

      try {
        const mapInstance = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: mapStyle,
          center: [-73.986104, 40.715245],
          zoom: 12.77,
          maxZoom: 18,
          minZoom: 9,
          renderWorldCopies: false,
          attributionControl: false
        });

        mapRef.current = mapInstance;

        // Set up viewport change handler ref
        handleViewportChangeRef.current = handleViewportChange;

        // Add comprehensive error handling for map errors
        mapInstance.on('error', (e) => {
          console.error('MapLibre error (non-critical):', e.error?.message || e.error);
          // Don't re-throw font/glyph errors as they're non-critical
        });

        // Map event listeners
        mapInstance.on('load', () => {
          console.log('🗺️ Map loaded successfully');
          setMapLoaded(true);
          
          if (callbackRefs.current.onMapLoaded) {
            callbackRefs.current.onMapLoaded();
          }

          // Add vector layers after load using the stable callback
          if (!layersAddedRef.current) {
            addVectorLayers(mapInstance);
          }

          // Load initial businesses after map is ready - shorter delay
          setTimeout(() => {
            console.log('🏢 Loading initial businesses...');
            if (handleViewportChangeRef.current) {
              handleViewportChangeRef.current();
            }
          }, 500);
        });

        // Fallback timer - reduced time and better handling
        setTimeout(() => {
          if (!mapLoaded) {
            console.log('⏱️ Map load fallback timer - forcing mapLoaded to true');
            setMapLoaded(true);
            if (callbackRefs.current.onMapLoaded) {
              callbackRefs.current.onMapLoaded();
            }
            // Load businesses immediately after fallback
            setTimeout(() => {
              console.log('🏢 Fallback: Loading businesses after timer...');
              if (handleViewportChangeRef.current) {
                handleViewportChangeRef.current();
              }
            }, 100);
          }
        }, 2000); // Reduced from 3000ms to 2000ms

        // Viewport change handlers
        const debouncedMoveHandler = (() => {
          let timeout: NodeJS.Timeout;
          return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
              if (mapRef.current && typeof mapRef.current.getBounds === 'function' && handleViewportChangeRef.current) {
                handleViewportChangeRef.current();
              }
            }, 150);
          };
        })();

        mapInstance.on('moveend', () => {
          if (mapRef.current && typeof mapRef.current.getBounds === 'function' && handleViewportChangeRef.current) {
            handleViewportChangeRef.current();
          }
        });
        mapInstance.on('zoomend', () => {
          if (mapRef.current && typeof mapRef.current.getBounds === 'function' && handleViewportChangeRef.current) {
            handleViewportChangeRef.current();
          }
        });
        mapInstance.on('move', debouncedMoveHandler);

        // Add layers when source is ready
        mapInstance.on('sourcedata', (e) => {
          if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
            console.log('NYC tiles source loaded, adding vector layers via sourcedata event...');
            addVectorLayers(mapInstance);
          }
        });

        console.log('Map instance created successfully');

        // Initialize DeckGL overlay
        setTimeout(() => {
          if (mapRef.current && !overlayInstance) {
            console.log('🎨 Creating DeckGL overlay...');
            overlayInstance = new MapboxOverlay({
              interleaved: true,
              pickingRadius: 10,
            });
            
            mapRef.current.addControl(overlayInstance);
            setDeckOverlay(overlayInstance);
            setOverlayReady(true);
            console.log('✅ DeckGL overlay initialized');
          }
        }, 500);

      } catch (error) {
        console.error('Failed to create MapLibre instance:', error);
        return;
      }
    };

    initializeMap();

    // Cleanup
    return () => {
      [updateTimeoutRef, moveTimeoutRef, debounceTimeoutRef].forEach(ref => {
        if (ref.current) clearTimeout(ref.current);
      });
      
      landmarkMarkersRef.current.forEach(marker => {
        try { marker.remove(); } catch {}
      });
      
      // Clean up DeckGL overlay
      if (overlayInstance && mapRef.current) {
        try {
          mapRef.current.removeControl(overlayInstance);
          overlayInstance = null;
        } catch (error) {
          console.error('Error removing overlay:', error);
        }
      }
      
      if (mapRef.current) {
        try {
          console.log('🧹 Cleaning up map instance');
          mapRef.current.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        }
      }
      
      businessCacheRef.current.clear();
      layersAddedRef.current = false;
      setMapLoaded(false);
      setOverlayReady(false);
      setDeckOverlay(null);
      mapRef.current = null;
    };
  }, []); // Empty dependency array - should only run once

  // Update DeckGL layers when they change
  useEffect(() => {
    if (!deckOverlay || !overlayReady || deckGLLayers.length === 0) {
      console.log(`🎯 DeckGL update skipped:`, {
        hasOverlay: !!deckOverlay,
        overlayReady,
        layerCount: deckGLLayers.length
      });
      return;
    }

    try {
      console.log(`🎯 Updated DeckGL with ${deckGLLayers.length} layers`);
      deckOverlay.setProps({
        layers: deckGLLayers
      });
    } catch (error) {
      console.error('Error updating DeckGL layers:', error);
    }
  }, [deckGLLayers, deckOverlay, overlayReady]);

  // Load businesses when map becomes ready - STABLE VERSION
  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      console.log('🔄 Map is loaded, triggering initial business load...');
      setTimeout(() => {
        if (handleViewportChangeRef.current) {
          handleViewportChangeRef.current();
        }
      }, 500);
    }
  }, [mapLoaded]); // Only depend on mapLoaded, not loadBusinessesInViewport
  useEffect(() => {
    if (!mapRef.current || !neighborhoodCenter) return;
    
    console.log('🏙️ Centering map on neighborhood:', neighborhoodCenter);
    mapRef.current.flyTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 2000
    });
  }, [neighborhoodCenter]);

  // Load neighborhood businesses when search filters change - STABLE VERSION
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhoodFilter) return;
    
    const loadNeighborhoodBusinesses = async () => {
      console.log('🏙️ Search filters changed, loading neighborhood businesses');
      
      // Create neighborhood bounds from the boundary points with padding
      const boundary = searchFilters.neighborhoodFilter.boundary;
      const lats = boundary.map(p => p.lat);
      const lons = boundary.map(p => p.lon);
      
      // Add padding to ensure we capture all businesses in the area
      const latPadding = 0.015; // ~1.5km padding
      const lonPadding = 0.020; // ~1.5km padding (adjusted for longitude)
      
      const neighborhoodBounds: Bounds = {
        north: Math.max(...lats) + latPadding,
        south: Math.min(...lats) - latPadding,
        east: Math.max(...lons) + lonPadding,
        west: Math.min(...lons) - lonPadding
      };
      
      try {
        const zoom = mapRef.current!.getZoom();
        const businessLimit = getBusinessLimitForViewport(zoom, neighborhoodBounds);
        
        console.log('🏙️ Initial neighborhood business load:', {
          neighborhood: searchFilters.neighborhoodFilter.name,
          bounds: neighborhoodBounds,
          businessLimit
        });
        
        const neighborhoodBusinesses = await loadBusinessesInViewport?.(neighborhoodBounds, businessLimit);
        
        if (Array.isArray(neighborhoodBusinesses) && neighborhoodBusinesses.length > 0) {
          console.log(`✅ Initially loaded ${neighborhoodBusinesses.length} businesses for ${searchFilters.neighborhoodFilter.name}`);
          businessCacheRef.current.addMultiple(neighborhoodBusinesses);
        } else {
          console.log('❌ No businesses found for neighborhood:', searchFilters.neighborhoodFilter.name);
        }
        
      } catch (error) {
        console.error('❌ Error loading initial neighborhood businesses:', error);
      }
    };
    
    // Small delay to ensure map is ready
    setTimeout(loadNeighborhoodBusinesses, 500);
  }, [mapLoaded, searchFilters?.neighborhoodFilter]); // Removed unstable dependencies

  // Initialize DeckGL overlay
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || deckOverlay) return;
    
    let overlay = overlayInstance;
    if (!overlay) {
      overlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      });
      overlayInstance = overlay;
    }
    
    try {
      mapRef.current.addControl(overlay as any);
      setDeckOverlay(overlay);
      setOverlayReady(true);
    } catch (e) {
      console.log('DeckGL overlay already added:', e);
      setOverlayReady(true);
    }
  }, [mapLoaded]);

  // Handle search filter changes
  useEffect(() => {
    const filtersChanged = JSON.stringify(lastSearchFiltersRef.current) !== JSON.stringify(searchFilters);
    if (!filtersChanged || !mapRef.current || !mapLoaded) return;
    
    console.log('🔍 Search filters changed, clearing cache');
    lastSearchFiltersRef.current = searchFilters;
    businessCacheRef.current.clear();
    isLoadingRef.current = false;
    
    setTimeout(() => handleViewportChangeRef.current(), 100);
  }, [searchFilters, mapLoaded]);

  // Handle business updates
  useEffect(() => {
    if (businesses && Array.isArray(businesses) && businesses.length > 0) {
      businessCacheRef.current.addMultiple(businesses);
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  // Zoom to selected business
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !selectedBusiness?.position) return;
    
    mapRef.current.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16),
      duration: 600
    });
  }, [selectedBusiness?.id, mapLoaded]);

  // Handle landmarks with performance optimization
  useEffect(() => {
    if (!mapLoaded || !Array.isArray(landmarks) || landmarks.length === 0 || !mapRef.current) return;

    // Clear existing markers
    landmarkMarkersRef.current.forEach(marker => {
      try { marker.remove(); } catch {}
    });
    landmarkMarkersRef.current = [];

    const zoom = mapRef.current.getZoom();
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
          .addTo(mapRef.current!);
      } catch (error) {
        console.error('Error creating marker:', error);
        return null;
      }
    }).filter(Boolean) as maplibregl.Marker[];

    landmarkMarkersRef.current = markers;

    // Optimized zoom handler for emoji sizing
    const handleZoomChange = () => {
      const newZoom = mapRef.current!.getZoom();
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

    mapRef.current.on('zoom', handleZoomChange);

    return () => {
      try { mapRef.current?.off('zoom', handleZoomChange); } catch {}
    };
  }, [mapLoaded, landmarks]);

  return (
    <div
      ref={mapContainerRef}
      className="map-container maplibre-map"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: '100%',
        minWidth: '250px',
        minHeight: '300px',
        zIndex: 1,
        backgroundColor: '#B3E5FC',
        overflow: 'hidden'
      }}
    />
  );
};

export default MapLibreMap;
