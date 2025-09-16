import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { isCapacitor, createTileBlobUrl } from '@/utils/tileDecompression';
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

// Singleton ovxerlay for performance
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

  // Function to add vector layers - must be defined before setupMapEventListeners
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
    if (!bounds) return 200; // fallback if bounds is undefined
    
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    
    // Calculate viewport area in km²
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = latKm * lngKm;
    
    // Adaptive density based on zoom level - increased for more consistent loading
    let baseDensity: number;
    if (zoom >= 16) baseDensity = 500;        // Increased from 300
    else if (zoom >= 14) baseDensity = 250;   // Increased from 150  
    else if (zoom >= 12) baseDensity = 150;   // Increased from 80
    else baseDensity = 80;                    // Increased from 40
    
    // Adjust for mobile performance
    const mobileFactor = isMobile ? 0.8 : 1.0;  // Less aggressive mobile reduction
    const targetBusinesses = Math.ceil(areaKm2 * baseDensity * mobileFactor);
    
    const maxLimit = isMobile ? 20000 : 40000;    // Increased limits
    const minLimit = 5000;                        // Increased minimum from 200
    
    return Math.max(minLimit, Math.min(maxLimit, targetBusinesses));
  }, [isMobile]);

  // Optimized business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('🔍 DEBUG: MapLibreMap handleBusinessClick deps check', { 
      fetchFullBusinessDetails: typeof fetchFullBusinessDetails,
      callbackRefs: typeof callbackRefs.current 
    });
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
    console.log('🔍 DEBUG: handleViewportChange deps check', { 
      mapRef: typeof mapRef.current,
      mapLoaded: typeof mapLoaded,
      loadBusinessesInViewport: typeof loadBusinessesInViewport,
      getBusinessLimitForViewport: typeof getBusinessLimitForViewport 
    });
    
    if (!mapRef.current || !mapLoaded || !loadBusinessesInViewport || isLoadingRef.current) return;

    const map = mapRef.current;

    // If neighborhood search is active, load businesses within neighborhood bounds
    if (searchFilters?.neighborhoodFilter) {
      console.log('🏙️ Neighborhood filter active, loading businesses within neighborhood bounds');
      
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
        isLoadingRef.current = true;
        const zoom = map.getZoom();
        const businessLimit = getBusinessLimitForViewport(zoom, neighborhoodBounds);
        
        console.log('🏙️ Loading neighborhood businesses:', {
          neighborhood: searchFilters.neighborhoodFilter.name,
          bounds: neighborhoodBounds,
          businessLimit
        });
        
        const neighborhoodBusinesses = await loadBusinessesInViewport(neighborhoodBounds, businessLimit);
        
        if (Array.isArray(neighborhoodBusinesses) && neighborhoodBusinesses.length > 0) {
          console.log(`✅ Loaded ${neighborhoodBusinesses.length} businesses for ${searchFilters.neighborhoodFilter.name}`);
          businessCacheRef.current.addMultiple(neighborhoodBusinesses);
        }
        
      } catch (error) {
        console.error('❌ Error loading neighborhood businesses:', error);
      } finally {
        isLoadingRef.current = false;
      }
      return;
    }

    // Get current visible bounds - this is the key fix
    const currentBounds = map.getBounds();
    const currentZoom = map.getZoom();
    
    // Create tight bounds for the visible area FIRST
    const visibleBounds: Bounds = {
      north: currentBounds.getNorth(),
      south: currentBounds.getSouth(),
      east: currentBounds.getEast(),
      west: currentBounds.getWest(),
    };
    
    console.log('🗺️ Current visible bounds:', visibleBounds);
    
    // Load businesses for the EXACT visible area first
    try {
      isLoadingRef.current = true;
      const visibleBusinessLimit = Math.floor(getBusinessLimitForViewport(currentZoom, visibleBounds) * 0.8);
      
      console.log('🎯 Loading businesses for VISIBLE area:', {
        zoom: currentZoom.toFixed(2),
        businessLimit: visibleBusinessLimit,
        bounds: visibleBounds
      });
      
      const visibleBusinesses = await loadBusinessesInViewport(visibleBounds, visibleBusinessLimit);
      
      if (Array.isArray(visibleBusinesses) && visibleBusinesses.length > 0) {
        console.log(`✅ Loaded ${visibleBusinesses.length} businesses for VISIBLE viewport`);
        businessCacheRef.current.addMultiple(visibleBusinesses);
      } else {
        console.log('❌ No businesses loaded for visible viewport');
      }
      
      // Then load buffer area (don't wait for this)
      setTimeout(async () => {
        const latDiff = visibleBounds.north - visibleBounds.south;
        const lngDiff = visibleBounds.east - visibleBounds.west;
        const expansion = 0.3; // 30% expansion for buffer
        
        const bufferBounds: Bounds = {
          north: visibleBounds.north + latDiff * expansion,
          south: visibleBounds.south - latDiff * expansion,
          east: visibleBounds.east + lngDiff * expansion,
          west: visibleBounds.west - lngDiff * expansion,
        };
        
        const bufferBusinessLimit = Math.floor(getBusinessLimitForViewport(currentZoom, bufferBounds) * 0.3);
        
        console.log('🔮 Loading buffer businesses:', {
          businessLimit: bufferBusinessLimit,
          bounds: bufferBounds
        });
        
        const bufferBusinesses = await loadBusinessesInViewport(bufferBounds, bufferBusinessLimit);
        if (Array.isArray(bufferBusinesses) && bufferBusinesses.length > 0) {
          console.log(`🔮 Loaded ${bufferBusinesses.length} buffer businesses`);
          businessCacheRef.current.addMultiple(bufferBusinesses);
        }
      }, 100);
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    } finally {
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 200);
    }

  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport, searchFilters]);

  // // Keep a ref to latest handler for stable listeners
  useEffect(() => {
    handleViewportChangeRef.current = handleViewportChange;
  }, [handleViewportChange]);

  // Memoized DeckGL layers with better caching and visible area focus
  const deckGLLayers = useMemo(() => {
    const cachedBusinesses = businessCacheRef.current.getAll();
    
    // Also consider businesses from hook state as fallback/supplement
    const allBusinesses = cachedBusinesses.length > 0 ? cachedBusinesses : businesses;
    
    console.log('🎯 DeckGL layers calculation:', {
      cachedBusinessesCount: cachedBusinesses?.length || 0,
      hookBusinessesCount: businesses?.length || 0,
      finalBusinessesCount: allBusinesses?.length || 0,
      mapLoaded,
      hasMap: !!mapRef.current,
      containerDimensions: mapRef.current ? {
        width: mapRef.current?.getContainer().clientWidth,
        height: mapRef.current?.getContainer().clientHeight
      } : null
    });
    
    if (!allBusinesses || allBusinesses.length === 0) {
      console.log('❌ No businesses available for DeckGL layers (cache + hook)');
      return [];
    }

    try {
      let businessesToRender = allBusinesses;
      
      // Handle clustered data efficiently
      if (isClusteredData && Array.isArray(businesses) && businesses.length > 0) {
        const flattenedBusinesses: Business[] = [];
        businesses.forEach((item: any) => {
          if (item?.type === 'cluster' && Array.isArray(item.businesses)) {
            item.businesses.forEach((b: Business) => {
              if (b?.position) flattenedBusinesses.push(b);
            });
          } else if (item?.type !== 'cluster' && item?.position) {
            flattenedBusinesses.push(item);
          }
        });
        businessesToRender = flattenedBusinesses;
      }

      // Filter businesses to current viewport if map is loaded
      if (mapRef.current && mapLoaded) {
        const currentBounds = mapRef.current.getBounds();
        const visibleBusinesses = businessesToRender.filter(business => {
          if (!business?.position?.lat || !business?.position?.lng) return false;
          
          return business.position.lat <= currentBounds.getNorth() &&
                 business.position.lat >= currentBounds.getSouth() &&
                 business.position.lng <= currentBounds.getEast() &&
                 business.position.lng >= currentBounds.getWest();
        });
        
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

    
  // 2. Initialize the map once we have a valid string tileUrl
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
  
    const initializeMap = async () => {
      // Generate blob URLs for tiles
      const urls = ['/data/tiles/{z}/{x}/{y}.pbf'];
      const tileUrls: string[] = await Promise.all(
        urls.map(url => createTileBlobUrl(url))
      );
  
      // Build style
      const mapStyle: maplibregl.StyleSpecification = {
        version: 8,
        sources: {
          'nyc-tiles': {
            type: 'vector',
            tiles: tileUrls, // ✅ string[]
            minzoom: 9,
            maxzoom: 19,
            scheme: 'xyz',
          },
        },
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#fff' },
          },
          // add your layers here...
        ],
      };
  
      // Create map (with second-map config merged in)
      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current!,
        style: mapStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: isCapacitor() ? 19 : 18,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: false,
        transformRequest: (url, resourceType) => {
          if (resourceType === 'Tile') {
            console.log('🔧 Tile request:', {
              url,
              resourceType,
              isCapacitor: isCapacitor(),
            });
          }
  
          // Force HTTPS in Capacitor
          if (isCapacitor() && url.startsWith('http://')) {
            const httpsUrl = url.replace('http://', 'https://');
            console.log('🔒 Converting to HTTPS for Capacitor:', httpsUrl);
            return { url: httpsUrl };
          }
  
          return { url };
        },
      });
  
      mapRef.current = mapInstance;
    };
  
    initializeMap();
  }, []);

  // useEffect(() => {
  //   console.log('🔄 MapLibre useEffect triggered', { 
  //     hasContainer: !!mapContainerRef.current, 
  //     hasMap: !!mapRef.current,
  //     isCapacitor: isCapacitor(),
  //     containerDimensions: mapContainerRef.current ? {
  //       width: mapContainerRef.current.clientWidth,
  //       height: mapContainerRef.current.clientHeight
  //     } : null
  //   });
    
  //   if (!mapContainerRef.current || mapRef.current) return;

  //   // Ensure container has minimum dimensions before creating map
  //   const container = mapContainerRef.current;
  //   const containerWidth = container.clientWidth;
  //   const containerHeight = container.clientHeight;
    
  //   console.log('🔧 Container dimensions check:', { containerWidth, containerHeight });
    
  //   if (containerWidth < 100 || containerHeight < 100) {
  //     console.warn('⚠️ Container too small, waiting for proper sizing:', { containerWidth, containerHeight });
  //     // Retry after a brief delay to allow layout to complete
  //     const retryTimer = setTimeout(() => {
  //       if (mapContainerRef.current && !mapRef.current) {
  //         const newWidth = mapContainerRef.current.clientWidth;
  //         const newHeight = mapContainerRef.current.clientHeight;
  //         console.log('🔄 Retrying map creation with dimensions:', { newWidth, newHeight });
  //         // Trigger a re-render by updating a dummy state
  //         setMapLoaded(false);
  //       }
  //     }, 100);
  //     return () => clearTimeout(retryTimer);
  //   }
    
  //   // Store map instance in ref immediately after creation
  //   mapInstance = mapRef.current;
    
  //   // Set bounds after storing in ref
  //   try {
  //     console.log('🗺️ Setting map bounds for NYC region...');
  //     mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
  //     // Test basic map functionality
  //     console.log('🧪 Testing map methods:', {
  //       getZoom: mapInstance.getZoom(),
  //       getCenter: mapInstance.getCenter(),
  //       isStyleLoaded: mapInstance.isStyleLoaded()
  //     });
  //   } catch (error) {
  //     console.error('Error setting up map:', error);
  //   }

  //   // Enhanced error handling and loading with validation
  //   const setupMapEventListeners = (map: maplibregl.Map) => {
  //     try {
  //       // Verify map instance has required methods before adding listeners
  //       if (!map || typeof map.on !== 'function') {
  //         console.error('Invalid map instance - missing event methods');
  //         return;
  //       }

  //       map.on('error', (e) => {
  //         console.error('Map error:', e.error);
  //       });

  //       // Add fallback timer to ensure map loads even if 'load' event doesn't fire
  //       const loadFallbackTimer = setTimeout(() => {
  //         if (!mapLoaded) {
  //           console.log('Map load fallback timer - forcing mapLoaded to true');
  //           setMapLoaded(true);
  //           callbackRefs.current.onMapLoaded?.();
  //         }
  //       }, 2000); // 2 second fallback

  //       map.on('load', () => {
  //         console.log('Map loaded successfully via load event');
  //         clearTimeout(loadFallbackTimer);
  //         setMapLoaded(true);
  //         callbackRefs.current.onMapLoaded?.();
          
  //         // For desktop, manually add layers after map loads if sourcedata doesn't fire
  //         if (!isCapacitor() && !layersAddedRef.current) {
  //           console.log('Manually adding vector layers after map load...');
  //           setTimeout(() => {
  //             if (!layersAddedRef.current && mapRef.current) {
  //               addVectorLayers(mapRef.current);
  //             }
  //           }, 1000);
  //         }
  //       });

  //       // Optimized move handlers with validation
  //       const callViewportChange = () => {
  //         if (mapRef.current && typeof mapRef.current.getBounds === 'function') {
  //           handleViewportChangeRef.current();
  //         }
  //       };
        
  //       const debouncedMoveHandler = (() => {
  //         let timeout: NodeJS.Timeout;
  //         return () => {
  //           clearTimeout(timeout);
  //           timeout = setTimeout(callViewportChange, 150);
  //         };
  //       })();

  //       map.on('moveend', callViewportChange);
  //       map.on('zoomend', callViewportChange);
  //       map.on('move', debouncedMoveHandler);

  //       // Add map layers when ready with environment-specific handling
  //       map.on('sourcedata', (e) => {
  //         if (isCapacitor()) {
  //           // For Capacitor with raster tiles
  //           if (e.sourceId === 'osm' && e.isSourceLoaded && !layersAddedRef.current) {
  //             console.log('Capacitor raster tiles loaded successfully');
  //             layersAddedRef.current = true;
  //           } else if (e.sourceId === 'osm') {
  //             console.log('OSM source event:', {
  //               sourceId: e.sourceId,
  //               isSourceLoaded: e.isSourceLoaded,
  //               layersAdded: layersAddedRef.current
  //             });
  //           }
  //           return;
  //         }
          
  //         // For web environment with vector tiles
  //         if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
  //           console.log('NYC tiles source loaded, adding vector layers via sourcedata event...');
  //           addVectorLayers(mapInstance);
  //         } else if (e.sourceId === 'nyc-tiles') {
  //           console.log('NYC tiles sourcedata event:', {
  //             sourceId: e.sourceId,
  //             isSourceLoaded: e.isSourceLoaded,
  //             layersAdded: layersAddedRef.current
  //           });
  //         }
  //       });

  //       // Additional mobile-specific event handlers
  //       if (isCapacitor()) {
  //         map.on('data', (e: any) => {
  //           if (e.dataType === 'source' && e.sourceId === 'osm') {
  //             console.log('OSM data event:', {
  //               dataType: e.dataType,
  //               sourceId: e.sourceId,
  //               isSourceLoaded: e.isSourceLoaded
  //             });
  //           }
  //         });

  //         map.on('dataloading', (e: any) => {
  //           if (e.dataType === 'source' && e.sourceId === 'osm') {
  //             console.log('OSM data loading:', e.sourceId);
  //           }
  //         });
  //       }

  //       console.log('Map event listeners set up successfully');
  //     } catch (error) {
  //       console.error('Error setting up map event listeners:', error);
  //     }
  //   };

  //   // Setup event listeners
  //   setupMapEventListeners(mapInstance);

  //   console.log('Map instance created, setting up event listeners...');
  //   console.log('Map container dimensions:', {
  //     width: mapContainerRef.current?.clientWidth,
  //     height: mapContainerRef.current?.clientHeight
  //   });

  //   return () => {
  //     // Cleanup
  //     [updateTimeoutRef, moveTimeoutRef, debounceTimeoutRef].forEach(ref => {
  //       if (ref.current) clearTimeout(ref.current);
  //     });
      
  //     landmarkMarkersRef.current.forEach(marker => {
  //       try { marker.remove(); } catch {}
  //     });
      
  //     try {
  //       mapInstance.remove();
  //     } catch (error) {
  //       console.error('Error removing map:', error);
  //     }
      
  //     businessCacheRef.current.clear();
  //     layersAddedRef.current = false;
  //     setMapLoaded(false);
  //     mapRef.current = null;
  //   };
  // }, [isMobile, addVectorLayers]);


  // // Center map on neighborhood when neighborhoodCenter changes
  useEffect(() => {
    if (!mapRef.current || !neighborhoodCenter) return;
    
    console.log('🏙️ Centering map on neighborhood:', neighborhoodCenter);
    mapRef.current.flyTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14, // Good zoom level for neighborhood view
      duration: 2000
    });
  }, [neighborhoodCenter]);

  // Load neighborhood businesses when search filters change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhoodFilter || !loadBusinessesInViewport) return;
    
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
        
        const neighborhoodBusinesses = await loadBusinessesInViewport(neighborhoodBounds, businessLimit);
        
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
  }, [mapLoaded, searchFilters?.neighborhoodFilter, loadBusinessesInViewport, getBusinessLimitForViewport]);

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

  // Update DeckGL layers with throttling and immediate visible area updates
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    
    // Update immediately for visible area, then throttle for performance
    const updateLayers = () => {
      try {
        deckOverlay.setProps({ layers: deckGLLayers });
        console.log(`🎯 Updated DeckGL with ${deckGLLayers?.length || 0} layers`);
      } catch (error) {
        console.error('Error updating DeckGL:', error);
      }
    };
    
    // Update immediately if we have visible businesses
    if (mapRef.current && mapLoaded && deckGLLayers.length > 0) {
      updateLayers();
    } else {
      // Throttle updates for other cases
      updateTimeoutRef.current = setTimeout(updateLayers, 50);
    }
  }, [deckOverlay, overlayReady, deckGLLayers, mapLoaded]);

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
        minWidth: '250px', // Increased minimum width for mobile compatibility
        minHeight: '300px', // Increased minimum height for mobile compatibility
        zIndex: 1,
        backgroundColor: '#B3E5FC',
        overflow: 'hidden' // Prevent scrollbars on small screens
      }}
    />
  );
};

export default React.memo(MapLibreMap);