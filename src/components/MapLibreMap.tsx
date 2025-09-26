import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import type { LayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox'; // use this package
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { createTileBlobUrl, isCapacitor } from '@/utils/tileDecompression';
import { patchTileLoading } from '@/utils/capacitorTileHandler';
import { addTileDebugLogs, logCapacitorEnvironment } from '@/utils/debugCapacitorTiles';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import type { GeoJSONFeature } from 'maplibre-gl';
import type { Business } from '@/types/business';
import * as turf from '@turf/turf';
import type { Feature, Point } from 'geojson';

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

let overlayInstance: MapboxOverlay | null = null;

// Debounce utility function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Convert GeoJSON Point Feature -> { lat, lon }
const featureToLatLon = (feature: Feature<Point> | { lat: number; lon: number }) => {
  if ('geometry' in feature && feature.geometry?.type === 'Point') {
    return { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
  }
  if ('lat' in feature && 'lon' in feature) return feature;
  throw new Error('Invalid feature for conversion to lat/lon');
};

const createOptimizedGridSampling = (bounds: Bounds, businesses: Business[], maxBusinesses: number = 1000000, prioritizeVisible: boolean = false): Business[] => {
  if (!businesses || businesses.length <= maxBusinesses) return businesses;

  if (prioritizeVisible) {
    const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 1.5));
    const latStep = (bounds.north - bounds.south) / gridSize;
    const lngStep = (bounds.east - bounds.west) / gridSize;

    const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => [] as Business[]));

    businesses.forEach(business => {
      if (!business?.position?.lat || !business?.position?.lng) return;
      const latIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lat - bounds.south) / latStep)));
      const lngIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lng - bounds.west) / lngStep)));
      grid[latIndex][lngIndex].push(business);
    });

    const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize * 0.7));
    const result: Business[] = [];
    grid.forEach(row => row.forEach(cell => { if (cell.length) result.push(...cell.slice(0, businessesPerCell)); }));
    return result.slice(0, maxBusinesses);
  }

  const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 2));
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;

  const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => [] as Business[]));
  businesses.forEach(business => {
    if (!business?.position?.lat || !business?.position?.lng) return;
    const latIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lat - bounds.south) / latStep)));
    const lngIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lng - bounds.west) / lngStep)));
    grid[latIndex][lngIndex].push(business);
  });

  const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize));
  const result: Business[] = [];
  grid.forEach(row => row.forEach(cell => {
    if (!cell.length) return;
    const shuffled = cell.sort(() => Math.random() - 0.5);
    result.push(...shuffled.slice(0, businessesPerCell));
  }));

  return result.slice(0, maxBusinesses);
};

class BusinessCache {
  private cache = new Map<string, Business & { detailsLoaded?: boolean }>();
  private storageKey = 'businessCache';

  constructor() {
    this.loadFromStorage();
  }

  private persist() {
    try {
      const data = Array.from(this.cache.values());
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('⚠️ Failed to persist business cache', err);
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const arr: (Business & { detailsLoaded?: boolean })[] = JSON.parse(stored);
        arr.forEach(b => {
          if (b?.id) this.cache.set(b.id, b);
        });
        console.log(`✅ Restored ${this.cache.size} businesses from localStorage`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to restore business cache', err);
    }
  }

  set(id: string, business: Business & { detailsLoaded?: boolean }) {
    if (!id || !business) return;
    this.cache.set(id, business);
    this.persist();
  }

  get(id: string) {
    return this.cache.get(id);
  }

  getAll() {
    return Array.from(this.cache.values());
  }

  addMultiple(businesses: Business[], replace = false) {
    if (!Array.isArray(businesses)) return;
  
    if (replace) {
      // build a set of incoming IDs
      const incomingIds = new Set(businesses.map(b => b.id));
      // remove anything not in incoming
      for (const id of this.cache.keys()) {
        if (!incomingIds.has(id)) this.cache.delete(id);
      }
    }
  
    businesses.forEach(b => {
      if (b?.id) this.set(b.id, { ...b, detailsLoaded: !!b.detailsLoaded });
    });
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
  // state & refs
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  // refs - simplified
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);
  // Add loading state ref to prevent multiple calls
  const lastBoundsRef = useRef<string>('');

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // hooks - simplified to single source of truth
  const { businesses, loading, loadBusinessesInViewport, fetchFullBusinessDetails, isSearching } = useViewportBusinesses(searchFilters);

  // Simplified: Just trigger callback when businesses are loaded
  useEffect(() => {
    if (businesses && businesses.length > 0) {
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  const debugTileData = useCallback((map: maplibregl.Map) => {
    const handleDebugClick = (e: maplibregl.MapMouseEvent) => {
      const roadFeatures = map.queryRenderedFeatures(e.point, { 
        layers: ['nyc-roads'] 
      });
      
      console.log(`Found ${roadFeatures.length} road features`);
      
      if (roadFeatures.length > 0) {
        console.log('Sample properties:', roadFeatures[0].properties);
        
        const withNames = roadFeatures.filter(f => f.properties?.name);
        console.log(`Roads with names: ${withNames.length}`);
        
        if (withNames.length > 0) {
          console.log('Sample names:', withNames.slice(0, 3).map(f => f.properties.name));
        }
  
        // NEW: Debug label features specifically
        const labelFeatures = map.queryRenderedFeatures(e.point, { 
          layers: ['nyc-road-labels'] 
        });
        console.log(`Found ${labelFeatures.length} label features`);
        
        // Check if label layer exists
        const labelLayer = map.getLayer('nyc-road-labels');
        console.log('Label layer exists:', !!labelLayer);
        console.log('Current zoom:', map.getZoom());
      }
    };
    
    map.on('click', handleDebugClick);
    return () => map.off('click', handleDebugClick);
  }, []);

  const testLabelsVisibility = useCallback((map: maplibregl.Map) => {
    console.log('🧪 Testing labels visibility...');
    
    const zoom = map.getZoom();
    console.log(`Current zoom: ${zoom}`);
    
    // Query all label features in viewport
    const bbox = map.getBounds();
    const labelFeatures = map.querySourceFeatures('nyc-tiles', {
      sourceLayer: 'examplepoints',
      filter: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['has', 'name'],
        ['has', 'highway'],
        ['!=', ['get', 'name'], '']
      ]
    });
    
    console.log(`Total features matching label filter: ${labelFeatures.length}`);
    
    if (labelFeatures.length > 0) {
      const sample = labelFeatures.slice(0, 5);
      console.log('Sample features for labels:', sample.map(f => ({
        name: f.properties?.name,
        highway: f.properties?.highway
      })));
    }
    
    // Check rendered features
    const rendered = map.queryRenderedFeatures({ layers: ['nyc-road-labels'] });
    console.log(`Rendered label features: ${rendered.length}`);
  }, []);
  
  // Add this diagnostic function to test different filters
  const testLabelFilters = useCallback((map: maplibregl.Map) => {
    console.log('🧪 Testing different label filters...');
    
    // Test 1: All features with names (no geometry restriction)
    const allNamed = map.querySourceFeatures('nyc-tiles', {
      sourceLayer: 'examplepoints',
      filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']]
    });
    console.log(`🧪 All named features: ${allNamed.length}`);
    
    // Test 2: LineString features with names
    const namedLines = map.querySourceFeatures('nyc-tiles', {
      sourceLayer: 'examplepoints',
      filter: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['has', 'name'],
        ['!=', ['get', 'name'], '']
      ]
    });
    console.log(`🧪 Named LineString features: ${namedLines.length}`);
    
    // Test 3: Features with highway property
    const withHighway = map.querySourceFeatures('nyc-tiles', {
      sourceLayer: 'examplepoints',
      filter: ['has', 'highway']
    });
    console.log(`🧪 Features with highway: ${withHighway.length}`);
    
    // Test 4: Current label filter
    const labelMatch = map.querySourceFeatures('nyc-tiles', {
      sourceLayer: 'examplepoints',
      filter: [
        'all',
        ['has', 'name'],
        ['!=', ['get', 'name'], '']
      ]
    });
    console.log(`🧪 Current label filter matches: ${labelMatch.length}`);
    
    if (labelMatch.length > 0) {
      console.log('🧪 Sample label candidates:', 
        labelMatch.slice(0, 3).map(f => ({
          name: f.properties?.name,
          type: f.geometry?.type,
          highway: f.properties?.highway
        }))
      );
    }
  }, []);


  // vector layers (styling restored exactly as requested)
  const addVectorLayers = useCallback((map: maplibregl.Map) => {
    try {
      const layers: LayerSpecification[] = [
        {
          id: 'nyc-land',
          type: 'fill',
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
          filter: ['all', ['==', ['geometry-type'], 'Polygon']]
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
              ['==', ['get', 'leisure'], 'garden'],
              ['==', ['get', 'leisure'], 'playground'],
              ['==', ['get', 'leisure'], 'recreation_ground'],
              ['==', ['get', 'leisure'], 'nature_reserve'],
              ['==', ['get', 'leisure'], 'sports_centre'],
              ['==', ['get', 'leisure'], 'pitch'],
              ['==', ['get', 'landuse'], 'grass'],
              ['==', ['get', 'landuse'], 'meadow'],
              ['==', ['get', 'landuse'], 'cemetery'],
              ['>=',
                ['index-of', 'cemetery', ['downcase', ['coalesce', ['get', 'name'], '']]],
                0
              ]
            ]
          ] as any
        },
        {
          id: 'nyc-water',
          type: 'fill',
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
        },
        {
          id: 'nyc-roads',
          type: 'line',
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          paint: {
            'line-color': '#666666',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
            'line-opacity': 0.8
          },
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
        },
        {
          id: 'nyc-road-labels',
          type: 'symbol',
          source: 'nyc-tiles',
          'source-layer': 'examplepoints',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13, 10,
              16, 14,
              18, 16
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-optional': false, // Changed from true
            'text-padding': 4, // Increased padding
            'symbol-placement': 'line',
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'viewport',
            'text-max-angle': 45,
            'symbol-spacing': 250,
            'text-font': ['Open Sans Regular', 'Arial Regular'] // Fallback fonts
          },
          paint: {
            'text-color': '#2C2C2C',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 2,
            'text-opacity': 1
          },
          // Ultra-simplified filter - if you can click it, it should have a label
          filter: [
            'all',
            ['has', 'name'],
            ['!=', ['get', 'name'], '']
          ],
          minzoom: 12 // Lowered from 13 to see labels sooner
        }
      ];
  
      console.log('🗺️ Adding vector layers...');
      
      layers.forEach(layer => {
        try {
          console.log(`🔍 Attempting to add layer: ${layer.id}`);
          
          if (!map.getLayer(layer.id)) {
            console.log(`🔍 Layer ${layer.id} doesn't exist, adding...`);
            map.addLayer(layer);
            console.log(`✅ Successfully added layer: ${layer.id}`);
            
            // Enhanced verification
            setTimeout(() => {
              const check = map.getLayer(layer.id);
              console.log(`🔍 Post-add verification: ${layer.id} exists = ${!!check}`);
              
              // Special debugging for labels layer
              if (layer.id === 'nyc-road-labels') {
                console.log('🏷️ Label layer details:', {
                  exists: !!check,
                  zoom: map.getZoom(),
                  minzoom: layer.minzoom,
                  shouldBeVisible: map.getZoom() >= (layer.minzoom || 0)
                });
                
                // Test query for label features
                const center = map.getCenter();
                const labelTest = map.querySourceFeatures('nyc-tiles', {
                  sourceLayer: 'examplepoints',
                  filter: layer.filter
                });
                console.log(`🏷️ Potential label features in source: ${labelTest.length}`);
                
                if (labelTest.length > 0) {
                  console.log('🏷️ Sample label feature:', {
                    name: labelTest[0].properties?.name,
                    highway: labelTest[0].properties?.highway,
                    geometry: labelTest[0].geometry.type
                  });
                }
              }
            }, 500);
          } else {
            console.log(`⚠️ Layer ${layer.id} already exists, skipping`);
          }
        } catch (err) {
          console.error(`❌ FAILED to add layer ${layer.id}:`, err);
        }
      });
      testLabelFilters(map);
  
      layersAddedRef.current = true;
    } catch (err) {
      console.error('❌ addVectorLayers error:', err);
    }
  }, []);

  const getBusinessLimitForViewport = useCallback((zoom: number) => {
    // For search results, show more businesses across all zoom levels
    if (searchFilters) {
      if (zoom < 10) return 20000;
      if (zoom < 12) return 35000;
      if (zoom < 14) return 50000;
      return 80000;
    }
    // Regular browsing limits
    if (zoom < 10) return 5000;
    if (zoom < 12) return 15000;
    if (zoom < 14) return 40000;
    if (zoom < 16) return 80000;
    if (zoom < 18) return 150000;
    return 200000;
  }, [searchFilters]);

  // Updated handleBusinessClick with fly-to behavior
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !callbackRefs.current.onBusinessClick) return;
  
    try {
      let businessToReturn = business;
  
      // Fly to the business on map
      if (mapRef.current && business?.position?.lat && business?.position?.lng) {
        mapRef.current.flyTo({
          center: [business.position.lng, business.position.lat],
          zoom: 16,
          speed: 1.2,
          curve: 1.2,
          essential: true
        });
      }
  
      // Load full details if needed  
      if (business.id && !business.id.startsWith('vector_') && fetchFullBusinessDetails) {
        const full = await fetchFullBusinessDetails(business.id);
        if (full) {
          businessToReturn = full;
        }
      }
  
      callbackRefs.current.onBusinessClick(businessToReturn);
  
    } catch (err) {
      console.warn('handleBusinessClick error', err);
      callbackRefs.current.onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails]);

  // Trigger load ONLY on search filter changes - prevent multiple calls
  useEffect(() => {
    if (mapLoaded && mapRef.current && searchFilters) {
      const timeout = setTimeout(() => {
        const map = mapRef.current!;
        const bounds = map.getBounds();
        const viewportBounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        };
        loadBusinessesInViewport?.(viewportBounds, 8000);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [searchFilters, mapLoaded, loadBusinessesInViewport]);

  const deckGLLayers = useMemo(() => {
    if (!businesses || !businesses.length) {
      return [];
    }
  
    // Ensure each business has valid lat/lng
    let validBusinesses = businesses.filter(
      b => b?.position?.lat != null && b?.position?.lng != null
    );
    
    if (!validBusinesses.length) {
      return [];
    }
  
    // Handle neighborhood filter if present
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      const neighborhoodCoords = searchFilters.neighborhoodFilter.boundary.map((p: any) => featureToLatLon(p));
      if (neighborhoodCoords.length) {
        const turfPolygon = turf.polygon([neighborhoodCoords.map(p => [p.lon, p.lat])]);
        validBusinesses = validBusinesses.filter(b => {
          const point = turf.point([b.position.lng, b.position.lat]);
          return turf.booleanPointInPolygon(point, turfPolygon);
        });
      }
    }
  
    if (!validBusinesses.length) return [];
  
    let safeLayer: any = null;
    try {
      safeLayer = createBusinessScatterplotLayer({
        businesses: validBusinesses,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
        neighborhoodBoundary: searchFilters?.neighborhoodFilter?.boundary || null
      });
      console.log("✅ Created scatterplot layer:", safeLayer);
    } catch (err) {
      console.error("❌ Failed to create scatterplot layer", err);
    }
    
    return safeLayer ? [safeLayer] : [];
  }, [selectedBusiness?.id, handleBusinessClick, mapLoaded, searchFilters, businesses]);
  
  const lastLoadTimeRef = useRef(0);

  const handleViewportChange = useCallback(async () => {
    if (!mapRef.current || !mapLoaded) return;
  
    const map = mapRef.current;
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const viewportBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };
  
    const boundsKey = `${viewportBounds.north.toFixed(4)}-${viewportBounds.south.toFixed(4)}-${viewportBounds.east.toFixed(4)}-${viewportBounds.west.toFixed(4)}`;
  
    // Prevent duplicate calls for same viewport within 1s (reduced from 2s)
    const now = Date.now();
    if (lastBoundsRef.current === boundsKey && now - lastLoadTimeRef.current < 250) {
      return;
    }
  
    lastBoundsRef.current = boundsKey;
    lastLoadTimeRef.current = now;
  
    try {
      console.log(`🗺️ Loading businesses for viewport: ${boundsKey}`);
      const limit = getBusinessLimitForViewport(zoom);
      await loadBusinessesInViewport?.(viewportBounds, limit, true); // Pass isMoving=true
    } catch (err) {
      console.error("❌ Error loading businesses:", err);
    }
  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport]);

  // initialize map once
  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;
      
      // Enhanced Capacitor setup with debugging
      if (isCapacitor()) {
        console.log('🔧 Setting up Capacitor tile handling');
        logCapacitorEnvironment();
        addTileDebugLogs();
        patchTileLoading();
        
        // Add a small delay to ensure patching is complete
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const vectorSource = {
        type: 'vector' as const,
        tiles: [`${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`],
        minzoom: 10,
        maxzoom: 16,
        scheme: 'xyz' as const
      };

      const style = {
        version: 8 as const,
        glyphs: `${window.location.origin}/assets/fonts/{fontstack}/{range}.pbf`,
        sources: { 'nyc-tiles': vectorSource },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#F5F5DC' } }
        ]
      } as any;

      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current!,
        style,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 19,
        minZoom: 8,
        renderWorldCopies: false,
        attributionControl: false
      });

      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

      mapRef.current = mapInstance;

      // Add event listener for flyToBusiness custom event
      const handleFlyToBusiness = (event: CustomEvent) => {
        const { lat, lng } = event.detail;
        if (mapRef.current && lat != null && lng != null) {
          mapRef.current.flyTo({
            center: [lng, lat],
            zoom: 16,
            speed: 1.2,
            curve: 1.2,
            essential: true
          });
        }
      };

      window.addEventListener('flyToBusiness', handleFlyToBusiness as EventListener);

      mapInstance.on('error', (e) => {
        console.error('🗺️ Map error:', e.error || e);
        
        // Handle tile loading errors more gracefully in Capacitor
        if (isCapacitor() && e.error?.message?.includes('Unable to parse the tile')) {
          console.log('🔧 Tile parsing error in Capacitor - attempting recovery');
          
          // Don't mark as loaded immediately, give tiles another chance
          setTimeout(() => {
            if (!mapLoaded && mapRef.current) {
              console.log('🗺️ Setting map as loaded after tile error recovery attempt');
              setMapLoaded(true);
              callbackRefs.current.onMapLoaded?.();
            }
          }, 2000);
        } else {
          // For other errors, continue as before
          if (!mapLoaded) {
            console.log('🗺️ Setting map as loaded despite error');
            setMapLoaded(true);
            callbackRefs.current.onMapLoaded?.();
          }
        }
      });

      mapInstance.on('load', () => {
        console.log('🗺️ Map loaded successfully');
        setMapLoaded(true);
        callbackRefs.current.onMapLoaded?.();
        
        try {
          if (!layersAddedRef.current) {
            addVectorLayers(mapInstance);
          }
        } catch (err) {
          console.error('❌ Error adding layers:', err);
        }
        
        // ADD THIS LINE - Call the debug function
        debugTileData(mapInstance);
        console.log('🔍 Debug click handler added - click anywhere on the map to see tile data');
        
        // Add more debugging for source and layers
        setTimeout(() => {
          console.log('🔍 Checking map sources and layers...');
          
          // Check if source exists and is loaded
          const source = mapInstance.getSource('nyc-tiles');
          console.log('🔍 NYC tiles source:', source);
          
          // Check all layers in the map
          const style = mapInstance.getStyle();
          console.log('🔍 Map style layers:', style.layers.map(l => ({ 
            id: l.id, 
            type: l.type, 
            source: 'source' in l ? l.source : 'no-source' 
          })));
          
          // Check specifically for your layers
          const roadLayer = mapInstance.getLayer('nyc-roads');
          const labelLayer = mapInstance.getLayer('nyc-road-labels');
          console.log('🔍 Road layer exists:', !!roadLayer, roadLayer);
          console.log('🔍 Label layer exists:', !!labelLayer, labelLayer);
          
          // Try to query a larger area to see if ANY features exist
          const bounds = mapInstance.getBounds();
          const bbox = [
            [bounds.getWest(), bounds.getSouth()],
            [bounds.getEast(), bounds.getNorth()]
          ];
          
          try {
            const allFeatures = mapInstance.queryRenderedFeatures(undefined, { layers: ['nyc-roads'] });
            console.log('🔍 All road features in viewport:', allFeatures.length, allFeatures);
          } catch (e) {
            console.log('❌ Could not query road features:', e);
          }
          
          // Test tile URL directly
          const zoom = Math.floor(mapInstance.getZoom());
          const center = mapInstance.getCenter();
          const tileZ = zoom;
          const tileX = Math.floor((center.lng + 180) / 360 * Math.pow(2, tileZ));
          const tileY = Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, tileZ));
          
          const testTileUrl = `${window.location.origin}/data/tiles/${tileZ}/${tileX}/${tileY}.pbf`;
          console.log('🔍 Testing tile URL:', testTileUrl);
          
          // Test if the tile URL is accessible
          fetch(testTileUrl)
            .then(response => {
              console.log('🔍 Tile fetch response:', response.status, response);
              if (!response.ok) {
                console.error('❌ Tile not found at:', testTileUrl);
              } else {
                console.log('✅ Tile exists and is accessible');
              }
            })
            .catch(error => {
              console.error('❌ Tile fetch error:', error);
            });
            
        }, 2000);
        
        // Load businesses for the initial viewport
        setTimeout(() => {
          if (mapRef.current && !loading) {
            handleViewportChange();
          }
        }, 1000);
      });

      // Add interaction event listeners
      mapInstance.on('click', (e) => {
        const features = mapInstance.queryRenderedFeatures(e.point);
        if (features && features.length > 0) {
          features.forEach(feature => {
            if (feature.properties && feature.properties.name) {
              console.log(`🔍 Clicked feature: ${feature.properties.name}`);
            }
          });
        }
      });

      // Initial event listeners will be set up in separate useEffect

      // Handle deck.gl overlay initialization
      try {
        const overlay = new MapboxOverlay({
          interleaved: true,
          layers: []
        });
        mapInstance.addControl(overlay as any);
        setDeckOverlay(overlay);
        overlayInstance = overlay;
        
        setTimeout(() => setOverlayReady(true), 100);
      } catch (overlayError) {
        console.error('❌ Failed to initialize Deck.GL overlay:', overlayError);
      }

      // Cleanup function
      return () => {
        window.removeEventListener('flyToBusiness', handleFlyToBusiness as EventListener);
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    };

    initializeMap();
  }, []);

  // update deck layers
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    deckOverlay.setProps({ layers: deckGLLayers });
  }, [deckOverlay, overlayReady, deckGLLayers]);

  useEffect(() => {
    if (deckOverlay && overlayReady) {
      console.log(`🔄 Refreshing Deck overlay with ${businesses.length} businesses`);
      deckOverlay.setProps({ layers: deckGLLayers });
    }
  }, [businesses, deckOverlay, overlayReady, deckGLLayers]);

  // Set up move/zoom event listeners - updates when handleViewportChange changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const debounceViewportChange = debounce(() => {
      handleViewportChange();
    }, 800);
    
    mapRef.current.on('moveend', debounceViewportChange);
    mapRef.current.on('zoomend', debounceViewportChange);

    return () => {
      if (mapRef.current) {
        mapRef.current.off('moveend', debounceViewportChange);
        mapRef.current.off('zoomend', debounceViewportChange);
      }
    };
  }, [mapLoaded, handleViewportChange]);

  // Initial load when map is ready - SINGLE TRIGGER
  useEffect(() => {
    if (mapLoaded && !businesses?.length && !loading) {
      const timeout = setTimeout(() => handleViewportChange(), 2000);
      return () => clearTimeout(timeout);
    }
  }, [mapLoaded, handleViewportChange]);

  // center/load neighborhood center
  const isUserInteractingRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
  
    const onDragStart = () => { isUserInteractingRef.current = true; };
    const onDragEnd = () => { isUserInteractingRef.current = false; };
    const onZoomStart = () => { isUserInteractingRef.current = true; };
    const onZoomEnd = () => { isUserInteractingRef.current = false; };
  
    map.on("dragstart", onDragStart);
    map.on("dragend", onDragEnd);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
  
    return () => {
      map.off("dragstart", onDragStart);
      map.off("dragend", onDragEnd);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
    };
  }, [mapLoaded]);
  
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhoodFilter || !neighborhoodCenter) return;
  
    // cancel if user is scrolling
    if (isUserInteractingRef.current) {
      console.log("⏸️ User interacting with map, skipping auto-fly");
      return;
    }
  
    // debounce until search input idle (e.g., 800ms after last change)
    const timeout = setTimeout(() => {
      if (!isUserInteractingRef.current && mapRef.current) {
        console.log("✈️ Flying to neighborhood center");
        mapRef.current.flyTo({
          center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
          zoom: 14,
          duration: 1500,
          essential: true
        });
      }
    }, 800);
  
    return () => clearTimeout(timeout);
  }, [searchFilters?.neighborhoodFilter, neighborhoodCenter, mapLoaded]);

  // Load businesses ONLY when search filters change
  useEffect(() => {
    if (mapLoaded && searchFilters?.neighborhoodFilter) {
      const timeout = setTimeout(() => handleViewportChange(), 500);
      return () => clearTimeout(timeout);
    }
  }, [mapLoaded, searchFilters?.neighborhoodFilter, handleViewportChange]);

  // landmarks handling (unchanged)
  useEffect(() => {
    if (!mapLoaded || !Array.isArray(landmarks) || landmarks.length === 0 || !mapRef.current) return;

    // remove old markers
    landmarkMarkersRef.current.forEach(marker => { try { marker.remove(); } catch {} });
    landmarkMarkersRef.current = [];

    const zoom = mapRef.current.getZoom();
    const size = Math.max(12, Math.min(32, 16 * Math.pow(1.15, zoom - 10)));

    const markers = landmarks.map(landmark => {
      const el = document.createElement('div');
      el.textContent = landmark.emoji;
      el.style.cssText = `font-size:${size}px;line-height:${size}px;width:${size}px;height:${size}px;user-select:none;pointer-events:none;display:flex;align-items:center;justify-content:center;`;
      try {
        return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([landmark.lng, landmark.lat]).addTo(mapRef.current!);
      } catch (err) {
        console.error('marker error', err);
        return null;
      }
    }).filter(Boolean) as maplibregl.Marker[];

    landmarkMarkersRef.current = markers;

    const onZoom = () => {
      const z = mapRef.current!.getZoom();
      const newSize = Math.max(12, Math.min(32, 16 * Math.pow(1.15, z - 10)));
      markers.forEach(m => {
        const el = m.getElement();
        if (el) { el.style.fontSize = `${newSize}px`; el.style.lineHeight = `${newSize}px`; el.style.width = `${newSize}px`; el.style.height = `${newSize}px`; }
      });
    };
    mapRef.current.on('zoom', onZoom);
    return () => { try { mapRef.current?.off('zoom', onZoom); } catch {} };
  }, [mapLoaded, landmarks]);

  return (
    <div
      ref={mapContainerRef}
      className="map-container maplibre-map"
      style={{
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        width: '100%', height: '100%',
        minWidth: '250px', minHeight: '300px',
        zIndex: 1, backgroundColor: '#B3E5FC', overflow: 'hidden'
      }}
    />
  );
};

export default MapLibreMap;