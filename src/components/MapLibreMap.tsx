import React, { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import { createBusinessScatterplotLayer, createEmojiLandmarkLayer } from "@/utils/deckGLLayers";
import { useViewportBusinesses, type MapBounds } from "../hooks/useViewportBusinesses";
import { registerGzipTileProtocol, getTileUrlTemplate } from "@/utils/tileProtocol";
import { isAndroid } from "@/utils/platform";
import type { Business } from "@/types/business";
import { searchFiltersKey, type SearchFilters } from "@/services/search";
import { NYC_BOUNDS, NYC_CENTER } from "@/utils/geo";

export interface MapHandle {
  /** Fly to a point, zooming in to street level but never zooming back out. */
  flyTo: (lat: number, lng: number) => void;
}

interface MapLibreMapProps {
  onBusinessClick?: (business: Business) => void;
  selectedBusiness?: Business | null;
  landmarks?: { lat: number; lng: number; emoji: string }[];
  onMapLoaded?: () => void;
  onBusinessesLoaded?: () => void;
  searchFilters?: SearchFilters | null;
  neighborhoodCenter?: { lat: number; lon: number } | null;
}

const VIEWPORT_THROTTLE_MS = { VERY_FAR: 800, FAR: 500, MID: 300, CLOSE: 150 } as const;

// Row limits requested per fetch. PostgREST caps a single response at 1000 rows;
// the tile-chunked loader is what actually delivers density when zoomed in.
const BUSINESS_LIMITS = {
  SEARCH: { ZOOM_10: 10000, ZOOM_12: 20000, ZOOM_14: 35000, DEFAULT: 60000 },
  NORMAL: { ZOOM_10: 3000, ZOOM_12: 10000, ZOOM_14: 25000, ZOOM_16: 60000, ZOOM_18: 100000, DEFAULT: 150000 },
} as const;

// How many dots we are willing to draw at each zoom before thinning.
const DISPLAY_LIMITS_BY_ZOOM = { ZOOM_10: 1000, ZOOM_11: 2000, ZOOM_12: 4000, ZOOM_13: 8000, ZOOM_14: 15000, ZOOM_15: 30000 } as const;

const MAP_DEFAULTS = {
  CENTER: NYC_CENTER,
  ZOOM: 12.77,
  MAX_ZOOM: 18,
  MIN_ZOOM: 8,
  BOUNDS: [
    [NYC_BOUNDS.west, NYC_BOUNDS.south],
    [NYC_BOUNDS.east, NYC_BOUNDS.north],
  ] as [[number, number], [number, number]],
} as const;

const getBusinessLimit = (zoom: number, searching: boolean) => {
  if (searching) {
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
};

const getDisplayLimit = (zoom: number) =>
  zoom < 10
    ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_10
    : zoom < 11
      ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_11
      : zoom < 12
        ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_12
        : zoom < 13
          ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_13
          : zoom < 14
            ? DISPLAY_LIMITS_BY_ZOOM.ZOOM_14
            : DISPLAY_LIMITS_BY_ZOOM.ZOOM_15;

const boundsOf = (map: maplibregl.Map): MapBounds => {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
};

/** Cheap deterministic 32-bit hash (FNV-1a) for stable sampling order. */
const stableHash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** At very low zoom keep one representative business per grid cell. */
const thinByGrid = (businesses: Business[], zoom: number): Business[] => {
  if (zoom >= 11) return businesses;
  const gridSize = zoom < 9 ? 15 : zoom < 10 ? 30 : 60;
  const grid = new Map<string, Business>();
  for (const b of businesses) {
    const key = `${Math.floor(b.position.lat * gridSize)}_${Math.floor(b.position.lng * gridSize)}`;
    if (!grid.has(key)) grid.set(key, b);
  }
  return Array.from(grid.values());
};

/**
 * Spread a display cap evenly across the viewport: bucket businesses into a
 * grid, then take one from each non-empty cell per pass until the cap is hit.
 */
const sampleAcrossViewport = (bounds: MapBounds, businesses: Business[], maxBusinesses: number): Business[] => {
  if (businesses.length <= maxBusinesses) return businesses;

  const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 1.5));
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;
  const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => [] as Business[]));

  for (const business of businesses) {
    const latIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lat - bounds.south) / latStep)));
    const lngIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((business.position.lng - bounds.west) / lngStep)));
    grid[latIndex][lngIndex].push(business);
  }

  // Order each cell by a stable hash of the id so the same businesses are picked
  // every time the layer rebuilds; a random shuffle made dots flicker while loading.
  const cells = grid.flat().filter((cell) => cell.length > 0);
  cells.forEach((cell) => cell.sort((a, b) => stableHash(a.id) - stableHash(b.id)));

  const result: Business[] = [];
  for (let depth = 0; result.length < maxBusinesses; depth++) {
    let addedThisPass = false;
    for (const cell of cells) {
      if (depth < cell.length) {
        result.push(cell[depth]);
        addedThisPass = true;
        if (result.length >= maxBusinesses) break;
      }
    }
    if (!addedThisPass) break;
  }
  return result;
};

const BASE_LAYERS: LayerSpecification[] = [
  {
    id: "nyc-land",
    type: "fill",
    source: "nyc-tiles",
    "source-layer": "examplepoints",
    paint: { "fill-color": "#F5F5DC", "fill-opacity": 1.0 },
    filter: ["all", ["==", ["geometry-type"], "Polygon"]],
  },
  {
    id: "nyc-green-spaces",
    type: "fill",
    source: "nyc-tiles",
    "source-layer": "examplepoints",
    paint: { "fill-color": "#87C17A", "fill-opacity": 1.0 },
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
    ],
  },
  {
    id: "nyc-water",
    type: "fill",
    source: "nyc-tiles",
    "source-layer": "examplepoints",
    paint: { "fill-color": "#6CA4E1", "fill-opacity": 1.0 },
    filter: ["all", ["==", ["geometry-type"], "Polygon"], ["has", "natural"]],
  },
  {
    id: "nyc-roads",
    type: "line",
    source: "nyc-tiles",
    "source-layer": "examplepoints",
    paint: {
      "line-color": "#666666",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 10, 0.5, 14, 1.5, 16, 3],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 0.8],
    },
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["has", "highway"]],
  },
  {
    id: "nyc-road-labels",
    type: "symbol",
    source: "nyc-tiles",
    "source-layer": "examplepoints",
    minzoom: 13,
    filter: [
      "all",
      ["has", "name"],
      [
        "match",
        ["get", "highway"],
        ["motorway", "trunk", "primary", "secondary", "tertiary"],
        true,
        ["step", ["zoom"], false, 14, ["in", ["get", "highway"], ["literal", ["residential", "unclassified", "living_street"]]]],
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
    paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.2 },
  },
];

const buildStyle = (): StyleSpecification => {
  const android = isAndroid();
  return {
    version: 8,
    glyphs: android ? "assets/fonts/{fontstack}/{range}.pbf" : `${window.location.origin}/data/{fontstack}/{range}.pbf`,
    sources: {
      "nyc-tiles": {
        type: "vector",
        tiles: [android ? "gzpbf://assets/tiles/{z}/{x}/{y}.pbf" : getTileUrlTemplate()],
        minzoom: 6,
        maxzoom: 16,
        scheme: "xyz",
      },
    },
    layers: [{ id: "background", type: "background", paint: { "background-color": "#F5F5DC" } }, ...BASE_LAYERS],
  };
};

const MapLibreMap = forwardRef<MapHandle, MapLibreMapProps>(function MapLibreMap(
  { onBusinessClick, selectedBusiness, landmarks = [], onMapLoaded, onBusinessesLoaded, searchFilters, neighborhoodCenter },
  ref,
) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(MAP_DEFAULTS.ZOOM);
  // Businesses the user has clicked this session (rendered orange). Resets on reload.
  const [clickedBusinessIds, setClickedBusinessIds] = useState<Set<string>>(new Set());

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const lastBoundsRef = useRef("");
  const lastLoadTimeRef = useRef(0);
  const viewportUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialLoadRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const lastProcessedZoomRef = useRef<number>(MAP_DEFAULTS.ZOOM);
  const isZoomingRef = useRef(false);
  const tileErrorCountRef = useRef(0);

  // Latest callbacks without re-binding map listeners on every render.
  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => {
    callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded };
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  const { businesses, loadBusinessesInViewport, fetchFullBusinessDetails } = useViewportBusinesses(searchFilters);

  const flyTo = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), speed: 1.2, curve: 1.2, essential: true });
  }, []);

  useImperativeHandle(ref, () => ({ flyTo }), [flyTo]);

  useEffect(() => {
    if (businesses.length > 0) callbackRefs.current.onBusinessesLoaded?.();
  }, [businesses]);

  const handleBusinessClick = useCallback(
    async (business: Business) => {
      if (!business || !callbackRefs.current.onBusinessClick) return;

      setClickedBusinessIds((prev) => {
        if (prev.has(business.id)) return prev;
        const next = new Set(prev);
        next.add(business.id);
        return next;
      });

      if (business.position?.lat && business.position?.lng) flyTo(business.position.lat, business.position.lng);

      try {
        const full = business.id && !business.id.startsWith("vector_") ? await fetchFullBusinessDetails(business.id) : null;
        callbackRefs.current.onBusinessClick(full ?? business);
      } catch (err) {
        console.warn("handleBusinessClick error", err);
        callbackRefs.current.onBusinessClick(business);
      }
    },
    [fetchFullBusinessDetails, flyTo],
  );

  const deckGLLayers = useMemo(() => {
    const layers: Layer[] = [];

    if (landmarks.length > 0) {
      const emojiLayer = createEmojiLandmarkLayer({ landmarks, zoom: currentZoom });
      if (emojiLayer) layers.push(emojiLayer);
    }

    // Draw at every zoom the map allows; thinning below keeps the zoomed-out view light.
    if (businesses.length > 0) {
      let visible = businesses.filter((b) => b?.position?.lat != null && b?.position?.lng != null);

      if (currentZoom < 11 && visible.length > 3000) visible = thinByGrid(visible, currentZoom);

      if (currentZoom < 15 && mapRef.current) {
        const maxDisplay = getDisplayLimit(currentZoom);
        if (visible.length > maxDisplay) visible = sampleAcrossViewport(boundsOf(mapRef.current), visible, maxDisplay);
      }

      const scatter = createBusinessScatterplotLayer({
        businesses: visible,
        onBusinessClick: handleBusinessClick,
        neighborhoodBoundary: searchFilters?.neighborhood?.boundary ?? null,
        zoom: currentZoom,
        clickedBusinessIds,
      });
      if (scatter) layers.push(scatter);
    }

    return layers;
    // selectedBusiness is included so the layer rebuilds when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusiness?.id, handleBusinessClick, currentZoom, businesses, clickedBusinessIds, landmarks, searchFilters]);

  const handleViewportChange = useCallback(
    async (forceUpdate = false) => {
      const map = mapRef.current;
      if (!map || !mapLoaded) return;
      if (isUserInteractingRef.current && !forceUpdate) return;

      const zoom = map.getZoom();
      const zoomDelta = Math.abs(zoom - lastProcessedZoomRef.current);
      if (isZoomingRef.current && zoomDelta < 0.5 && !forceUpdate) return;

      setCurrentZoom(zoom);
      lastProcessedZoomRef.current = zoom;

      const viewportBounds = boundsOf(map);
      const boundsKey = [viewportBounds.north, viewportBounds.south, viewportBounds.east, viewportBounds.west]
        .map((n) => n.toFixed(4))
        .join("-");

      const throttleMs =
        zoom < 10
          ? VIEWPORT_THROTTLE_MS.VERY_FAR
          : zoom < 12
            ? VIEWPORT_THROTTLE_MS.FAR
            : zoom < 14
              ? VIEWPORT_THROTTLE_MS.MID
              : VIEWPORT_THROTTLE_MS.CLOSE;

      const now = Date.now();
      if (lastBoundsRef.current === boundsKey && now - lastLoadTimeRef.current < throttleMs && !forceUpdate) return;

      if (viewportUpdateTimeoutRef.current) clearTimeout(viewportUpdateTimeoutRef.current);
      lastBoundsRef.current = boundsKey;
      lastLoadTimeRef.current = now;

      try {
        await loadBusinessesInViewport(viewportBounds, getBusinessLimit(zoom, !!searchFilters), true, zoom);
      } catch (err) {
        console.error("Error loading businesses:", err);
      }
    },
    [mapLoaded, loadBusinessesInViewport, searchFilters],
  );

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    registerGzipTileProtocol();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildStyle(),
      center: MAP_DEFAULTS.CENTER,
      zoom: MAP_DEFAULTS.ZOOM,
      maxZoom: MAP_DEFAULTS.MAX_ZOOM,
      minZoom: MAP_DEFAULTS.MIN_ZOOM,
      renderWorldCopies: false,
      attributionControl: false,
    });
    map.setMaxBounds(MAP_DEFAULTS.BOUNDS);
    mapRef.current = map;

    const markLoaded = () => {
      setMapLoaded((already) => {
        if (!already) callbackRefs.current.onMapLoaded?.();
        return true;
      });
    };

    map.on("error", (e) => {
      console.error("Map error:", e.error || e);
      const message = e.error?.message ?? "";
      if (message.includes("fetch") || message.includes("tile")) {
        tileErrorCountRef.current++;
        if (tileErrorCountRef.current >= 10) markLoaded();
        return;
      }
      markLoaded();
    });

    map.on("load", markLoaded);

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);
    overlayRef.current = overlay;

    return () => {
      overlayRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push deck.gl layers to the overlay, debounced more at low zoom where data churns.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !mapLoaded) return;
    const debounceTime = currentZoom < 10 ? 500 : currentZoom < 12 ? 300 : 100;
    const timeoutId = setTimeout(() => overlay.setProps({ layers: deckGLLayers }), debounceTime);
    return () => clearTimeout(timeoutId);
  }, [mapLoaded, deckGLLayers, currentZoom]);

  // Initial data load once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapLoaded || hasInitialLoadRef.current || !map) return;
    hasInitialLoadRef.current = true;
    const zoom = map.getZoom();
    setCurrentZoom(zoom);
    loadBusinessesInViewport(boundsOf(map), getBusinessLimit(zoom, !!searchFilters), true, zoom);
  }, [mapLoaded, loadBusinessesInViewport, searchFilters]);

  // Viewport listeners.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const debouncedViewportChange = () => {
      if (viewportUpdateTimeoutRef.current) clearTimeout(viewportUpdateTimeoutRef.current);
      viewportUpdateTimeoutRef.current = setTimeout(() => handleViewportChange(), 200);
    };
    const onDragStart = () => {
      isUserInteractingRef.current = true;
    };
    const onDragEnd = () => {
      isUserInteractingRef.current = false;
    };
    const onZoomStart = () => {
      isUserInteractingRef.current = true;
      isZoomingRef.current = true;
    };
    const onZoomEnd = () => {
      isUserInteractingRef.current = false;
      isZoomingRef.current = false;
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => handleViewportChange(true), { timeout: 500 });
      } else {
        setTimeout(() => handleViewportChange(true), 100);
      }
    };

    map.on("moveend", debouncedViewportChange);
    map.on("zoomend", debouncedViewportChange);
    map.on("dragstart", onDragStart);
    map.on("dragend", onDragEnd);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    return () => {
      map.off("moveend", debouncedViewportChange);
      map.off("zoomend", debouncedViewportChange);
      map.off("dragstart", onDragStart);
      map.off("dragend", onDragEnd);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      if (viewportUpdateTimeoutRef.current) clearTimeout(viewportUpdateTimeoutRef.current);
    };
  }, [mapLoaded, handleViewportChange]);

  // Reload when the search changes.
  const searchFiltersHash = useMemo(() => searchFiltersKey(searchFilters) || "none", [searchFilters]);
  const prevHashRef = useRef(searchFiltersHash);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (prevHashRef.current !== searchFiltersHash && hasInitialLoadRef.current) {
      prevHashRef.current = searchFiltersHash;
      lastBoundsRef.current = "";
      handleViewportChange();
    }
  }, [searchFiltersHash, mapLoaded, handleViewportChange]);

  // Fly to a searched neighborhood once the user stops interacting.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhood || !neighborhoodCenter) return;
    if (isUserInteractingRef.current) return;

    const timeout = setTimeout(() => {
      if (!isUserInteractingRef.current && mapRef.current) {
        mapRef.current.flyTo({ center: [neighborhoodCenter.lon, neighborhoodCenter.lat], zoom: 14, duration: 1500, essential: true });
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [searchFilters?.neighborhood, neighborhoodCenter, mapLoaded]);

  return <div ref={mapContainerRef} style={{ position: "absolute", top: 0, bottom: 0, width: "100%" }} />;
});

export default MapLibreMap;
