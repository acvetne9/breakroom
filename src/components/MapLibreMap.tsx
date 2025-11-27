import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { createBusinessScatterplotLayer, createEmojiLandmarkLayer } from "@/utils/deckGLLayers";
import { useViewportMapData } from "../hooks/useViewportMapData";
import { useViewportBusinesses } from "../hooks/useViewportBusinesses";
import { useBusinessSearch } from "@/hooks/useBusinessSearch";
import { createTileBlobUrl, isCapacitor } from "@/utils/tileDecompression";
import { patchTileLoading } from "@/utils/capacitorTileHandler";
import { addTileDebugLogs, logCapacitorEnvironment } from "@/utils/debugCapacitorTiles";
import type { NeighborhoodBounds } from "@/utils/nyc_neighborhoods";
import type { GeoJSONFeature } from "maplibre-gl";
import type { Business } from "@/types/business";
import * as turf from "@turf/turf";
import type { Feature, Point } from "geojson";
import type { MapGeoJSONFeature } from "maplibre-gl";
import { Capacitor } from "@capacitor/core";

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
  onBusinessesUpdate?: (businesses: Business[]) => void;
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const VIEWPORT_THROTTLE = {
  VERY_FAR_ZOOM: 2000,  // Increased from 1500
  FAR_ZOOM: 1500,       // Increased from 1000
  MID_ZOOM: 800,        // Increased from 500
  CLOSE_ZOOM: 300,
} as const;

// OPTIMIZED: Increased limits to fill map with dots at all zoom levels
const BUSINESS_LIMITS = {
  SEARCH: {
    ZOOM_10: 15000,    // Increased to fill far zoom
    ZOOM_12: 25000,    // Increased to fill medium zoom
    ZOOM_14: 40000,    // Increased to fill closer zoom
    DEFAULT: 60000,    // Increased for closest zoom
  },
  NORMAL: {
    ZOOM_10: 10000,    // Significantly increased from 500
    ZOOM_12: 20000,    // Significantly increased from 2000
    ZOOM_14: 35000,    // Significantly increased from 8000
    ZOOM_16: 60000,    // Significantly increased from 25000
    ZOOM_18: 100000,   // Significantly increased from 50000
    DEFAULT: 150000,   // Significantly increased from 75000
  },
} as const;

const DISPLAY_LIMITS_BY_ZOOM = {
  ZOOM_10: 2000,     // Significantly increased to fill far zoom
  ZOOM_11: 3000,     // Increased to fill map
  ZOOM_12: 5000,     // Increased to ensure good coverage
  ZOOM_13: 8000,     // Increased for medium zoom
  ZOOM_14: 12000,    // Increased for closer zoom
  ZOOM_15: 20000,    // Increased for close zoom
} as const;

const MAP_DEFAULTS = {
  CENTER: [-73.986104, 40.715245] as [number, number],
  ZOOM: 12.77,
  MAX_ZOOM: 16,
  MIN_ZOOM: 8,
  BOUNDS: [
    [-74.25909, 40.494399] as [number, number],
    [-73.700272, 40.917] as [number, number],
  ] as [readonly [number, number], readonly [number, number]],
} as const;

let overlayInstance: MapboxOverlay | null = null;

const featureToLatLon = (feature: Feature | { lat: number; lon: number }) => {
  if ("geometry" in feature && feature.geometry?.type === "Point") {
    return {
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0]
    };
  }
  if ("lat" in feature && "lon" in feature) return feature;
  throw new Error("Invalid feature for conversion to lat/lon");
};

// NEW: Clustering function for low zoom levels - adjusted for better coverage
const clusterBusinesses = (businesses: Business[], zoom: number): Business[] => {
  // Only cluster at very far zoom levels (< 11)
  if (zoom >= 11) return businesses;
  
  // Smaller grid size means more representatives shown
  const gridSize = zoom < 10 ? 20 : 40;
  const grid = new Map<string, Business[]>();
  
  businesses.forEach((b) => {
    if (!b?.position?.lat || !b?.position?.lng) return;
    
    const gridKey = `${Math.floor(b.position.lat * gridSize)}_${Math.floor(b.position.lng * gridSize)}`;
    if (!grid.has(gridKey)) {
      grid.set(gridKey, []);
    }
    grid.get(gridKey)!.push(b);
  });
  
  // Return one representative per cluster (prefer higher rated businesses)
  return Array.from(grid.values()).map(cluster => {
    if (cluster.length === 1) return cluster[0];
    
    // Sort by some quality metric if available, otherwise take first
    return cluster.sort((a, b) => {
      const aScore = a.roles?.reduce((sum, r) => sum + (r.votesTotal || 0), 0) || 0;
      const bScore = b.roles?.reduce((sum, r) => sum + (r.votesTotal || 0), 0) || 0;
      return bScore - aScore;
    })[0];
  });
};

const createOptimizedGridSampling = (
  bounds: Bounds,
  businesses: Business[],
  maxBusinesses: number = 1000000,
): Business[] => {
  const validBusinesses = businesses.filter(b => b != null);
  if (!validBusinesses || validBusinesses.length <= maxBusinesses) return validBusinesses;

  // OPTIMIZED: Uniform spatial distribution instead of grid-based sampling
  // This ensures businesses are spread evenly across the entire map
  
  // Calculate the area and density
  const area = (bounds.north - bounds.south) * (bounds.east - bounds.west);
  const targetDensity = maxBusinesses / area;
  
  // Sort businesses by a spatial hash to ensure even distribution
  const spatialHash = (b: Business) => {
    if (!b?.position?.lat || !b?.position?.lng) return 0;
    
    // Create a consistent spatial hash based on coordinates
    const latNorm = (b.position.lat - bounds.south) / (bounds.north - bounds.south);
    const lngNorm = (b.position.lng - bounds.west) / (bounds.east - bounds.west);
    
    // Use a prime number multiplier for better distribution
    return Math.floor(latNorm * 73856093) ^ Math.floor(lngNorm * 19349663);
  };
  
  // Sort by spatial hash to get pseudo-random but consistent ordering
  const sortedBusinesses = [...validBusinesses].sort((a, b) => {
    return spatialHash(a) - spatialHash(b);
  });
  
  // Use Poisson Disk Sampling approach for uniform distribution
  const selected: Business[] = [];
  const minDistance = Math.sqrt(area / maxBusinesses) * 0.7; // Minimum distance between points
  
  // Quick spatial lookup grid for checking distances
  const cellSize = minDistance;
  const gridWidth = Math.ceil((bounds.east - bounds.west) / cellSize);
  const gridHeight = Math.ceil((bounds.north - bounds.south) / cellSize);
  const grid = new Map<string, Business>();
  
  const getCellKey = (lat: number, lng: number) => {
    const row = Math.floor((lat - bounds.south) / cellSize);
    const col = Math.floor((lng - bounds.west) / cellSize);
    return `${row},${col}`;
  };
  
  const isValidPoint = (business: Business): boolean => {
    if (!business?.position?.lat || !business?.position?.lng) return false;
    
    const lat = business.position.lat;
    const lng = business.position.lng;
    const cellKey = getCellKey(lat, lng);
    
    // Check surrounding cells for nearby points
    const row = Math.floor((lat - bounds.south) / cellSize);
    const col = Math.floor((lng - bounds.west) / cellSize);
    
    for (let dRow = -2; dRow <= 2; dRow++) {
      for (let dCol = -2; dCol <= 2; dCol++) {
        const neighborKey = `${row + dRow},${col + dCol}`;
        const neighbor = grid.get(neighborKey);
        
        if (neighbor && neighbor.position) {
          const dx = (neighbor.position.lng - lng) * Math.cos(lat * Math.PI / 180);
          const dy = neighbor.position.lat - lat;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < minDistance * minDistance) {
            return false;
          }
        }
      }
    }
    
    return true;
  };
  
  // Sample businesses with uniform spacing
  for (const business of sortedBusinesses) {
    if (selected.length >= maxBusinesses) break;
    
    if (isValidPoint(business)) {
      selected.push(business);
      if (business?.position?.lat && business?.position?.lng) {
        const cellKey = getCellKey(business.position.lat, business.position.lng);
        grid.set(cellKey, business);
      }
    }
  }
  
  // If we don't have enough businesses, fill with remaining (can happen in sparse areas)
  if (selected.length < maxBusinesses) {
    for (const business of sortedBusinesses) {
      if (selected.length >= maxBusinesses) break;
      if (!selected.includes(business)) {
        selected.push(business);
      }
    }
  }
  
  return selected.slice(0, maxBusinesses);
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
  isClusteredData = false,
  onBusinessesUpdate,
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(MAP_DEFAULTS.ZOOM);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersAddedRef = useRef(false);
  const lastBoundsRef = useRef("");
  const lastLoadTimeRef = useRef(0);
  const viewportUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialLoadRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const tileErrorCountRef = useRef(0);

  // Stable references for arrays to prevent re-renders
  const businessesRef = useRef<Business[]>([]);
  const landmarksRef = useRef<{ lat: number; lng: number; emoji: string }[]>([]);
  const searchFiltersRef = useRef<any>(null);

  const callbackRefs = useRef({
    onBusinessClick,
    onMapLoaded,
    onBusinessesLoaded,
    onBusinessesUpdate
  });

  useEffect(() => {
    callbackRefs.current = {
      onBusinessClick,
      onMapLoaded,
      onBusinessesLoaded,
      onBusinessesUpdate
    };
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded, onBusinessesUpdate]);

  const { businesses, loading, loadBusinessesInViewport, fetchFullBusinessDetails, isSearching } = useViewportBusinesses(searchFilters);
  const { searchBusinesses, searching } = useBusinessSearch();

  // Update refs only when data actually changes - OPTIMIZED: Use reference equality instead of JSON.stringify
  useEffect(() => {
    if (businesses !== businessesRef.current) {
      businessesRef.current = businesses;
    }
  }, [businesses]);

  useEffect(() => {
    if (landmarks !== landmarksRef.current) {
      landmarksRef.current = landmarks;
    }
  }, [landmarks]);

  useEffect(() => {
    if (searchFilters !== searchFiltersRef.current) {
      searchFiltersRef.current = searchFilters;
    }
  }, [searchFilters]);

  useEffect(() => {
    if (businesses && businesses.length > 0) {
      callbackRefs.current.onBusinessesLoaded?.();
      callbackRefs.current.onBusinessesUpdate?.(businesses);
    }
  }, [businesses]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      console.error("❌ WebGL is NOT supported in this WebView");
    } else {
      console.log("✅ WebGL is supported in this WebView");
    }
  }, []);

  const addVectorLayers = useCallback((map: maplibregl.Map) => {
    try {
      const layers: LayerSpecification[] = [
        {
          id: "nyc-land",
          type: "fill",
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          paint: {
            "fill-color": "#F5F5DC",
            "fill-opacity": 1.0
          },
          filter: ["all", ["==", ["geometry-type"], "Polygon"]],
        },
        {
          id: "nyc-green-spaces",
          type: "fill",
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          paint: {
            "fill-color": "#87C17A",
            "fill-opacity": 1.0
          },
          filter: [
            "all",
            ["==", ["geometry-type"], "Polygon"],
            [
              "any",
              ["==", ["get", "leisure"], "park"],
              ["==", ["get", "leisure"], "garden"],
              ["==", ["get", "leisure"], "playground"],
              ["==", ["get", "leisure"], "recreation_ground"],
              ["==", ["get", "leisure"], "nature_reserve"],
              ["==", ["get", "leisure"], "sports_centre"],
              ["==", ["get", "leisure"], "pitch"],
              ["==", ["get", "landuse"], "grass"],
              ["==", ["get", "landuse"], "meadow"],
              ["==", ["get", "landuse"], "cemetery"],
              [">=", ["index-of", "cemetery", ["downcase", ["coalesce", ["get", "name"], ""]]], 0],
            ],
          ] as any,
        },
        {
          id: "nyc-water",
          type: "fill",
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          paint: {
            "fill-color": "#6CA4E1",
            "fill-opacity": 1.0
          },
          filter: ["all", ["==", ["geometry-type"], "Polygon"], ["has", "natural"]],
        },
        {
          id: "nyc-roads",
          type: "line",
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          minzoom: 12, // OPTIMIZED: Don't render roads below zoom 12
          paint: {
            "line-color": "#666666",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5, 16, 3],
            "line-opacity": 0.8,
          },
          filter: ["all", ["==", ["geometry-type"], "LineString"], ["has", "highway"]],
        },
      ];

      layers.forEach((layer) => {
        try {
          if (layer.type === "symbol" && !("layout" in layer)) {
            (layer as any).layout = { "text-field": "" };
          }
          if (!map.getLayer(layer.id)) {
            map.addLayer(layer);
          }
        } catch (err) {
          console.error(`❌ Failed layer ${layer.id}:`, err);
        }
      });

      layersAddedRef.current = true;
    } catch (err) {
      console.error("❌ addVectorLayers error:", err);
    }
  }, []);

  const getBusinessLimitForViewport = useCallback(
    (zoom: number) => {
      if (searchFilters) {
        if (zoom < 10) return BUSINESS_LIMITS.SEARCH.ZOOM_10;
        if (zoom < 12) return BUSINESS_LIMITS.SEARCH.ZOOM_12;
        if (zoom < 14) return BUSINESS_LIMITS.SEARCH.ZOOM_14;
        return BUSINESS_LIMITS.SEARCH.DEFAULT;
      }

      if (zoom < 10) return BUSINESS_LIMITS.NORMAL.ZOOM_10;
      if (zoom < 12) return BUSINESS_LIMITS.NORMAL.ZOOM_12;
      if (zoom < 14) return BUSINESS_LIMITS.NORMAL.ZOOM_14;
      if (zoom < 16) return BUSINESS_LIMITS.NORMAL.ZOOM_16;
      if (zoom < 18) return BUSINESS_LIMITS.NORMAL.ZOOM_18;
      return BUSINESS_LIMITS.NORMAL.DEFAULT;
    },
    [searchFilters],
  );

  const handleBusinessClick = useCallback(
    async (business: any) => {
      if (!business || !callbackRefs.current.onBusinessClick) {
        return;
      }

      try {
        let businessToReturn = business;

        if (mapRef.current && business?.position?.lat && business?.position?.lng) {
          mapRef.current.flyTo({
            center: [business.position.lng, business.position.lat],
            zoom: 16,
            speed: 1.2,
            curve: 1.2,
            essential: true,
          });
        }

        if (business.id && !business.id.startsWith("vector_") && fetchFullBusinessDetails) {
          const full = await fetchFullBusinessDetails(business.id);
          if (full) {
            businessToReturn = full;
          }
        }

        callbackRefs.current.onBusinessClick(businessToReturn);
      } catch (err) {
        console.warn("handleBusinessClick error", err);
        callbackRefs.current.onBusinessClick(business);
      }
    },
    [fetchFullBusinessDetails],
  );

  // NEW: Handle business search from triggerSearch event - OPTIMIZED for speed
  const handleBusinessSearch = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 3) return;
    
    const searchStartTime = performance.now();
    
    try {
      // OPTIMIZATION: Search with higher limit to get more options quickly
      const results = await searchBusinesses(searchTerm, 15);
      
      console.log(`🔍 Search completed in ${(performance.now() - searchStartTime).toFixed(0)}ms, found ${results.length} results`);
      
      if (results.length === 0) {
        console.log('⚠️ No results found for:', searchTerm);
        return [];
      }
      
      // OPTIMIZATION: Find first result with coordinates (don't wait for all)
      const firstResultWithCoords = results.find(r => r.position?.lat && r.position?.lng);
      
      if (firstResultWithCoords && mapRef.current) {
        // OPTIMIZATION: Fly to location immediately, fetch details in parallel
        const flyPromise = mapRef.current.flyTo({
          center: [firstResultWithCoords.position!.lng, firstResultWithCoords.position!.lat],
          zoom: 16,
          speed: 1.5, // Slightly faster
          curve: 1.0, // Slightly more direct
          essential: true,
        });
        
        // Don't wait for flyTo animation - handle business click immediately
        handleBusinessClick(firstResultWithCoords);
        
        console.log(`✅ Navigation started in ${(performance.now() - searchStartTime).toFixed(0)}ms`);
      } else {
        console.warn('⚠️ First result missing coordinates:', results[0]);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error searching businesses:', error);
      return [];
    }
  }, [searchBusinesses, handleBusinessClick]);

  // OPTIMIZED: Memoize business filtering separately to avoid excessive recalculations
  const filteredBusinesses = useMemo(() => {
    const currentBusinesses = businessesRef.current;
    const currentSearchFilters = searchFiltersRef.current;

    console.log('🔍 Filtering businesses:', {
      totalBusinesses: currentBusinesses?.length || 0,
      hasSearchFilters: !!currentSearchFilters,
      neighborhoodBoundary: currentSearchFilters?.neighborhoodFilter?.boundary?.length || 0
    });

    if (!currentBusinesses || currentBusinesses.length === 0) {
      console.warn('⚠️ No businesses in businessesRef.current');
      return [];
    }

    let validBusinesses = currentBusinesses.filter(
      (b) => b != null && b?.position?.lat != null && b?.position?.lng != null
    );

    console.log('✅ Valid businesses with coordinates:', validBusinesses.length);

    // Filter by neighborhood boundary
    if (currentSearchFilters?.neighborhoodFilter?.boundary?.length) {
      console.log('🗺️ Applying neighborhood filter...');
      const coords = currentSearchFilters.neighborhoodFilter.boundary.map((p: any) =>
        featureToLatLon(p)
      );
      if (coords.length) {
        const polygon = turf.polygon([coords.map((p) => [p.lon, p.lat])]);
        const beforeFilter = validBusinesses.length;
        validBusinesses = validBusinesses.filter((b) =>
          turf.booleanPointInPolygon(turf.point([b.position.lng, b.position.lat]), polygon)
        );
        console.log('🗺️ Neighborhood filter:', beforeFilter, '→', validBusinesses.length, 'businesses');
      }
    }

    console.log('✅ Final filtered businesses:', validBusinesses.length);
    return validBusinesses;
  }, [businessesRef.current, searchFiltersRef.current?.neighborhoodFilter?.boundary]);

  // OPTIMIZED: Use refs and apply clustering - removed handleBusinessClick from dependencies
  const deckGLLayers = useMemo(() => {
    const layers: any[] = [];
    const currentLandmarks = landmarksRef.current;
    const currentSearchFilters = searchFiltersRef.current;

    // DEBUG: Log current state
    console.log('🎨 Rendering layers:', {
      zoom: currentZoom,
      filteredBusinesses: filteredBusinesses.length,
      landmarks: currentLandmarks?.length || 0,
      hasSearchFilters: !!currentSearchFilters
    });

    // 1. Emojis FIRST (render behind)
    if (currentLandmarks?.length > 0) {
      try {
        layers.push(createEmojiLandmarkLayer({ 
          landmarks: currentLandmarks,
          zoom: currentZoom // OPTIMIZED: Pass zoom for dynamic sizing
        }));
      } catch (err) {
        console.error("❌ Failed to create emoji layer", err);
      }
    }

    // 2. Business dots LAST (render on top)
    // FIXED: Render at all zoom levels (removed zoom >= 10 restriction)
    const shouldRenderBusinesses = currentZoom >= 8 || !!currentSearchFilters;

    console.log('🔍 Should render businesses?', shouldRenderBusinesses, 'zoom:', currentZoom);

    if (filteredBusinesses.length > 0 && shouldRenderBusinesses) {
      let validBusinesses = filteredBusinesses;

      console.log('📍 Starting with', validBusinesses.length, 'businesses');

      // OPTIMIZED: Apply clustering only at very far zoom levels with many businesses
      if (currentZoom < 11 && validBusinesses.length > 5000) {
        validBusinesses = clusterBusinesses(validBusinesses, currentZoom);
        console.log('🔄 After clustering:', validBusinesses.length, 'businesses');
      }

      // Apply zoom-based display limits for performance
      if (currentZoom < 15 && validBusinesses.length > 0 && mapRef.current) {
        const maxDisplay =
          currentZoom < 10 ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_10 :
          currentZoom < 11 ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_11 :
          currentZoom < 12 ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_12 :
          currentZoom < 13 ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_13 :
          currentZoom < 14 ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_14 :
          DISPLAY_LIMITS_BY_ZOOM.ZOOM_15;

        console.log('📊 Max display for zoom', currentZoom, ':', maxDisplay);

        if (validBusinesses.length > maxDisplay) {
          const bounds = mapRef.current.getBounds();
          const viewportBounds = {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          };

          console.log('🎯 Sampling from', validBusinesses.length, 'to', maxDisplay);

          validBusinesses = createOptimizedGridSampling(
            viewportBounds,
            validBusinesses,
            maxDisplay
          );
          
          console.log('✅ After sampling:', validBusinesses.length, 'businesses');
        }
      }

      if (validBusinesses.length > 0) {
        console.log('🎨 Creating layer with', validBusinesses.length, 'businesses');
        try {
          layers.push(
            createBusinessScatterplotLayer({
              businesses: validBusinesses,
              selectedBusinessId: selectedBusiness?.id,
              onBusinessClick: handleBusinessClick,
              neighborhoodBoundary: currentSearchFilters?.neighborhoodFilter?.boundary || null,
              searchActive: !!currentSearchFilters,
              zoom: currentZoom // OPTIMIZED: Pass zoom for dynamic sizing
            })
          );
        } catch (err) {
          console.error("❌ Failed to create scatterplot layer", err);
        }
      } else {
        console.warn('⚠️ No businesses to render after filtering');
      }
    } else {
      console.warn('⚠️ Not rendering businesses:', {
        hasBusinesses: filteredBusinesses.length > 0,
        shouldRender: shouldRenderBusinesses
      });
    }

    console.log('🎨 Total layers created:', layers.length);
    return layers;
  }, [filteredBusinesses, selectedBusiness?.id, currentZoom, mapLoaded]);

  // OPTIMIZED: Skip viewport updates during interaction
  const handleViewportChange = useCallback(async () => {
    if (!mapRef.current || !mapLoaded) return;
    
    // OPTIMIZED: Skip if user is actively interacting
    if (isUserInteractingRef.current) {
      return;
    }

    const map = mapRef.current;
    const zoom = map.getZoom();
    setCurrentZoom(zoom);

    const bounds = map.getBounds();
    const viewportBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };

    const boundsKey = `${viewportBounds.north.toFixed(4)}-${viewportBounds.south.toFixed(4)}-${viewportBounds.east.toFixed(4)}-${viewportBounds.west.toFixed(4)}`;

    const throttleMs =
      zoom < 10 ? VIEWPORT_THROTTLE.VERY_FAR_ZOOM :
      zoom < 12 ? VIEWPORT_THROTTLE.FAR_ZOOM :
      zoom < 14 ? VIEWPORT_THROTTLE.MID_ZOOM :
      VIEWPORT_THROTTLE.CLOSE_ZOOM;

    const now = Date.now();
    if (
      lastBoundsRef.current === boundsKey &&
      now - lastLoadTimeRef.current < throttleMs
    ) {
      return;
    }

    if (viewportUpdateTimeoutRef.current) {
      clearTimeout(viewportUpdateTimeoutRef.current);
    }

    lastBoundsRef.current = boundsKey;
    lastLoadTimeRef.current = now;

    try {
      const limit = searchFilters
        ? (zoom < 10 ? BUSINESS_LIMITS.SEARCH.ZOOM_10 :
           zoom < 12 ? BUSINESS_LIMITS.SEARCH.ZOOM_12 :
           zoom < 14 ? BUSINESS_LIMITS.SEARCH.ZOOM_14 :
           BUSINESS_LIMITS.SEARCH.DEFAULT)
        : (zoom < 10 ? BUSINESS_LIMITS.NORMAL.ZOOM_10 :
           zoom < 12 ? BUSINESS_LIMITS.NORMAL.ZOOM_12 :
           zoom < 14 ? BUSINESS_LIMITS.NORMAL.ZOOM_14 :
           zoom < 16 ? BUSINESS_LIMITS.NORMAL.ZOOM_16 :
           zoom < 18 ? BUSINESS_LIMITS.NORMAL.ZOOM_18 :
           BUSINESS_LIMITS.NORMAL.DEFAULT);

      await loadBusinessesInViewport?.(viewportBounds, limit, true);
    } catch (err) {
      console.error("❌ Error loading businesses:", err);
    }
  }, [mapLoaded, loadBusinessesInViewport, searchFilters]);

  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;

      if (isCapacitor()) {
        logCapacitorEnvironment();
        addTileDebugLogs();
        patchTileLoading();
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        let attempts = 0;
        const maxAttempts = 50;
        while (!(window as any).__SW_READY__ && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
      }

      function getTileAndGlyphURLs() {
        if (Capacitor.getPlatform() === "android") {
          return {
            tiles: `assets/tiles/{z}/{x}/{y}.pbf`,
            glyphs: `assets/fonts/{fontstack}/{range}.pbf`,
          };
        } else {
          return {
            tiles: `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`,
            glyphs: `${window.location.origin}/data/{fontstack}/{range}.pbf`,
          };
        }
      }

      const { tiles, glyphs } = getTileAndGlyphURLs();

      if (!isCapacitor()) {
        fetch(tiles.replace('{z}', '12').replace('{x}', '1205').replace('{y}', '1539'))
          .then(response => {
            if (!response.ok) {
              console.error("⚠️ Sample tile fetch failed");
            } else {
              console.log("✅ Tile validation successful");
            }
          })
          .catch(err => {
            console.error("⚠️ Tile validation failed:", err);
          });
      }

      const vectorSource = {
        type: "vector" as const,
        tiles: [tiles],
        minzoom: 9,
        maxzoom: 16,
        scheme: "xyz" as const,
      };

      const style = {
        version: 8 as const,
        glyphs: glyphs,
        sources: {
          "nyc-tiles": vectorSource
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#F5F5DC" },
          },
        ],
      };

      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current!,
        style,
        center: MAP_DEFAULTS.CENTER,
        zoom: MAP_DEFAULTS.ZOOM,
        maxZoom: MAP_DEFAULTS.MAX_ZOOM,
        minZoom: MAP_DEFAULTS.MIN_ZOOM,
        renderWorldCopies: false,
        attributionControl: false,
      } as any);

      mapInstance.setMaxBounds(MAP_DEFAULTS.BOUNDS as any);
      mapRef.current = mapInstance;

      const handleFlyToBusiness = (event: CustomEvent) => {
        const { lat, lng } = event.detail;
        if (mapRef.current && lat != null && lng != null) {
          mapRef.current.flyTo({
            center: [lng, lat],
            zoom: 16,
            speed: 3,
            curve: 1,
            essential: true,
          });
        }
      };

      const handleSearchEvent = (event: CustomEvent) => {
        handleBusinessSearch(event.detail);
      };

      window.addEventListener("flyToBusiness", handleFlyToBusiness as EventListener);
      window.addEventListener("triggerSearch", handleSearchEvent as EventListener);

      const maxTileErrors = 10;
      mapInstance.on("error", (e) => {
        console.error("🗺️ Map error:", e.error || e);

        if (e.error?.message?.includes("fetch") || e.error?.message?.includes("tile")) {
          tileErrorCountRef.current++;
          if (tileErrorCountRef.current >= maxTileErrors) {
            console.error("❌ Too many tile errors, stopping retries");
            if (!mapLoaded) {
              setMapLoaded(true);
              callbackRefs.current.onMapLoaded?.();
            }
            return;
          }
        }

        if (isCapacitor() && e.error?.message?.includes("Unable to parse the tile")) {
          setTimeout(() => {
            if (!mapLoaded && mapRef.current) {
              setMapLoaded(true);
              callbackRefs.current.onMapLoaded?.();
            }
          }, 2000);
        } else {
          if (!mapLoaded) {
            setMapLoaded(true);
            callbackRefs.current.onMapLoaded?.();
          }
        }
      });

      mapInstance.on("load", () => {
        setMapLoaded(true);
        callbackRefs.current.onMapLoaded?.();

        try {
          if (!layersAddedRef.current) {
            addVectorLayers(mapInstance);
          }
        } catch (err) {
          console.error("❌ Error adding layers:", err);
        }

        setTimeout(() => {
          if (mapRef.current) {
            const map = mapRef.current;
            const zoom = map.getZoom();
            setCurrentZoom(zoom);

            const bounds = map.getBounds();
            const viewportBounds = {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            };

            const limit = searchFilters
              ? (zoom < 10 ? BUSINESS_LIMITS.SEARCH.ZOOM_10 :
                 zoom < 12 ? BUSINESS_LIMITS.SEARCH.ZOOM_12 :
                 zoom < 14 ? BUSINESS_LIMITS.SEARCH.ZOOM_14 :
                 BUSINESS_LIMITS.SEARCH.DEFAULT)
              : (zoom < 10 ? BUSINESS_LIMITS.NORMAL.ZOOM_10 :
                 zoom < 12 ? BUSINESS_LIMITS.NORMAL.ZOOM_12 :
                 zoom < 14 ? BUSINESS_LIMITS.NORMAL.ZOOM_14 :
                 zoom < 16 ? BUSINESS_LIMITS.NORMAL.ZOOM_16 :
                 zoom < 18 ? BUSINESS_LIMITS.NORMAL.ZOOM_18 :
                 BUSINESS_LIMITS.NORMAL.DEFAULT);

            loadBusinessesInViewport?.(viewportBounds, limit, true);
          }
        }, 1000);
      });

      try {
        const overlay = new MapboxOverlay({
          interleaved: true,
          layers: [],
        });
        mapInstance.addControl(overlay as any);
        setDeckOverlay(overlay);
        overlayInstance = overlay;
        setTimeout(() => setOverlayReady(true), 100);
      } catch (overlayError) {
        console.error("❌ Failed to initialize Deck.GL overlay:", overlayError);
      }

      return () => {
        window.removeEventListener("flyToBusiness", handleFlyToBusiness as EventListener);
        window.removeEventListener("triggerSearch", handleSearchEvent as EventListener);
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    };

    initializeMap();
  }, [addVectorLayers, handleBusinessSearch, loadBusinessesInViewport, searchFilters]);

  // OPTIMIZED: Debounced deck overlay update with zoom-based delays
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;

    // OPTIMIZED: Longer debounce at low zoom levels
    const debounceTime = 
      currentZoom < 11 ? 400 :
      currentZoom < 12 ? 300 :
      currentZoom < 14 ? 200 : 
      100;

    const timeoutId = setTimeout(() => {
      deckOverlay.setProps({ layers: deckGLLayers });
    }, debounceTime);

    return () => clearTimeout(timeoutId);
  }, [deckOverlay, overlayReady, deckGLLayers, currentZoom]);

  // OPTIMIZED: Separate debounce for different interaction types
  const debouncedViewportChange = useCallback((interactionType: 'drag' | 'zoom' = 'drag') => {
    if (viewportUpdateTimeoutRef.current) {
      clearTimeout(viewportUpdateTimeoutRef.current);
    }

    // OPTIMIZED: Different delays for different interactions
    const delay = interactionType === 'drag' ? 400 : 600; // Drag faster, zoom medium

    viewportUpdateTimeoutRef.current = setTimeout(() => {
      handleViewportChange();
    }, delay);
  }, [handleViewportChange]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const handleMoveEnd = () => debouncedViewportChange('drag');
    const handleZoomEnd = () => debouncedViewportChange('zoom');

    mapRef.current.on("moveend", handleMoveEnd);
    mapRef.current.on("zoomend", handleZoomEnd);

    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", handleMoveEnd);
        mapRef.current.off("zoomend", handleZoomEnd);
      }
    };
  }, [mapLoaded, debouncedViewportChange]);

  useEffect(() => {
    if (mapLoaded && !hasInitialLoadRef.current && mapRef.current) {
      hasInitialLoadRef.current = true;

      const map = mapRef.current;
      const zoom = map.getZoom();
      const bounds = map.getBounds();
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };

      const limit = searchFilters
        ? (zoom < 10 ? BUSINESS_LIMITS.SEARCH.ZOOM_10 :
           zoom < 12 ? BUSINESS_LIMITS.SEARCH.ZOOM_12 :
           zoom < 14 ? BUSINESS_LIMITS.SEARCH.ZOOM_14 :
           BUSINESS_LIMITS.SEARCH.DEFAULT)
        : (zoom < 10 ? BUSINESS_LIMITS.NORMAL.ZOOM_10 :
           zoom < 12 ? BUSINESS_LIMITS.NORMAL.ZOOM_12 :
           zoom < 14 ? BUSINESS_LIMITS.NORMAL.ZOOM_14 :
           zoom < 16 ? BUSINESS_LIMITS.NORMAL.ZOOM_16 :
           zoom < 18 ? BUSINESS_LIMITS.NORMAL.ZOOM_18 :
           BUSINESS_LIMITS.NORMAL.DEFAULT);

      loadBusinessesInViewport?.(viewportBounds, limit, true);
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [mapLoaded, loadBusinessesInViewport, searchFilters]);

  const searchFiltersHash = useMemo(() => {
    if (!searchFilters) return 'none';
    return JSON.stringify({
      keyword: searchFilters.keyword,
      role: searchFilters.role,
      salary: searchFilters.salary,
      neighborhood: searchFilters.neighborhoodFilter?.name
    });
  }, [searchFilters]);

  const prevHashRef = useRef(searchFiltersHash);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    if (prevHashRef.current !== searchFiltersHash && hasInitialLoadRef.current) {
      prevHashRef.current = searchFiltersHash;
      lastBoundsRef.current = "";
      handleViewportChange();
    }
  }, [searchFiltersHash, mapLoaded, handleViewportChange]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    const onDragStart = () => {
      isUserInteractingRef.current = true;
    };

    const onDragEnd = () => {
      isUserInteractingRef.current = false;
      // OPTIMIZED: Trigger update after interaction ends
      setTimeout(() => handleViewportChange(), 300);
    };

    const onZoomStart = () => {
      isUserInteractingRef.current = true;
    };

    const onZoomEnd = () => {
      isUserInteractingRef.current = false;
      // OPTIMIZED: Trigger update after interaction ends
      setTimeout(() => handleViewportChange(), 300);
    };

    map.on("dragstart", onDragStart);
    map.on("dragend", onDragEnd);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    if (mapLoaded && !map.getLayer("nyc-road-labels")) {
      try {
        map.addLayer({
          id: "nyc-road-labels",
          type: "symbol",
          source: "nyc-tiles",
          "source-layer": "examplepoints",
          minzoom: 13, // OPTIMIZED: Only show labels at higher zoom
          filter: [
            "all",
            ["has", "name"],
            [
              "match",
              ["get", "highway"],
              ["motorway", "trunk", "primary", "secondary", "tertiary"],
              true,
              [
                "step",
                ["zoom"],
                false,
                14,
                ["in", ["get", "highway"], ["literal", ["residential", "unclassified", "living_street"]]],
              ],
            ],
          ],
          layout: {
            "text-field": ["coalesce", ["get", "name"], ""],
            "text-font": ["OpenSansArialUnicode"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, 11, 17, 13],
            "symbol-placement": "line",
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "map",
            "text-keep-upright": true,
            "symbol-spacing": 700,
            "text-max-angle": 25,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "text-optional": true,
            "text-padding": 2,
            "text-justify": "center",
          },
          paint: {
            "text-color": "#222",
            "text-halo-color": "#fff",
            "text-halo-width": 1.2,
          },
        } as any);
      } catch (err) {
        console.error("❌ Failed to add road labels layer:", err);
      }
    }

    return () => {
      map.off("dragstart", onDragStart);
      map.off("dragend", onDragEnd);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
    };
  }, [mapLoaded, handleViewportChange]);

  useEffect(() => {
    if (
      !mapRef.current ||
      !mapLoaded ||
      !searchFilters?.neighborhoodFilter ||
      !neighborhoodCenter
    )
      return;

    if (isUserInteractingRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      if (!isUserInteractingRef.current && mapRef.current) {
        mapRef.current.flyTo({
          center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
          zoom: 14,
          duration: 1500,
          essential: true,
        });
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [searchFilters?.neighborhoodFilter, neighborhoodCenter, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && searchFilters?.neighborhoodFilter) {
      const timeout = setTimeout(() => handleViewportChange(), 500);
      return () => clearTimeout(timeout);
    }
  }, [mapLoaded, searchFilters?.neighborhoodFilter, handleViewportChange]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "100%",
      }}
    />
  );
};

export default MapLibreMap;
