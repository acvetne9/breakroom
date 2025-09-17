// src/components/MapLibreMap.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox'; // use this package
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { createTileBlobUrl } from '@/utils/tileDecompression';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods';
import type { NeighborhoodBounds } from '@/utils/nyc_neighborhoods';
import type { GeoJSONFeature } from 'maplibre-gl';
import type { Business } from '@/types/business';
import * as turf from '@turf/turf';

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

// singleton overlay
let overlayInstance: MapboxOverlay | null = null;

// Convert GeoJSON Point Feature -> { lat, lon }
const featureToLatLon = (feature: turf.Feature<turf.Point> | { lat: number; lon: number }) => {
  if ('geometry' in feature && feature.geometry?.type === 'Point') {
    return { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
  }
  // Already { lat, lon }?
  if ('lat' in feature && 'lon' in feature) {
    return feature;
  }
  throw new Error('Invalid feature for conversion to lat/lon');
};


// basic grid-sampling (unchanged, preserved behavior)
const createOptimizedGridSampling = (bounds: Bounds, businesses: Business[], maxBusinesses: number, prioritizeVisible: boolean = false): Business[] => {
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

// Simple cache (no isMobile branch — consistent)
class BusinessCache {
  private cache = new Map<string, Business & { detailsLoaded?: boolean }>();
  private maxSize: number;

  constructor(maxSize = 15000) {
    this.maxSize = maxSize;
  }

  set(id: string, business: Business & { detailsLoaded?: boolean }) {
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxSize * 0.1));
      keysToDelete.forEach(key => this.cache.delete(key));
    }
    this.cache.set(id, business);
  }

  get(id: string): (Business & { detailsLoaded?: boolean }) | undefined {
    const business = this.cache.get(id);
    if (business) {
      this.cache.delete(id);
      this.cache.set(id, business);
    }
    return business;
  }

  getAll(): (Business & { detailsLoaded?: boolean })[] {
    return Array.from(this.cache.values());
  }

  addMultiple(businesses: Business[]) {
    businesses.forEach(b => { if (b?.id) this.set(b.id, b as any); });
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
  // state & refs
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const businessCacheRef = useRef(new BusinessCache(15000));
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastViewportRef = useRef<ViewportState | null>(null);
  const lastSearchFiltersRef = useRef(searchFilters);
  const handleViewportChangeRef = useRef<() => void>(() => {});

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // hooks
  const mapDataHook = useViewportMapData();
  const businessesHook = useViewportBusinesses(searchFilters);
  const { isProcessing, setIsProcessing } = mapDataHook;
  const { businesses: rawBusinesses, loading: businessesLoading, loadBusinessesInViewport, fetchFullBusinessDetails, isSearching } = businessesHook;
  const businesses = Array.isArray(rawBusinesses) ? rawBusinesses : [];

  // add to cache whenever hook returns results (so DeckGL can read from cache)
  useEffect(() => {
    if (businesses && businesses.length) {
      businessCacheRef.current.addMultiple(businesses);
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  // vector layers (styling restored exactly as requested)
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

      layers.forEach((layer, idx) => {
        try {
          if (!map.getLayer(layer.id)) map.addLayer(layer as any);
        } catch (err) {
          console.error('Error adding vector layer', layer.id, err);
        }
      });

      layersAddedRef.current = true;
    } catch (err) {
      console.error('addVectorLayers error', err);
    }
  }, []);

  // Business density heuristic (unchanged)
  const getBusinessLimitForViewport = useCallback((zoom: number, bounds: Bounds): number => {
    if (!bounds) return 200;
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = Math.max(0.00001, latKm * lngKm);

    let baseDensity = 80;
    if (zoom >= 16) baseDensity = 500;
    else if (zoom >= 14) baseDensity = 250;
    else if (zoom >= 12) baseDensity = 150;

    const target = Math.ceil(areaKm2 * baseDensity);
    const maxLimit = 40000;
    const minLimit = 5000;
    return Math.max(minLimit, Math.min(maxLimit, target));
  }, []);

  // handle business click -> fetch details if needed
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !callbackRefs.current.onBusinessClick) return;

    try {
      let businessToReturn = business;
      if (business.id && !business.id.startsWith('vector_') && fetchFullBusinessDetails) {
        const cached = businessCacheRef.current.get(business.id);
        if (cached && (cached as any).detailsLoaded) {
          businessToReturn = cached;
        } else {
          const full = await fetchFullBusinessDetails(business.id);
          if (full) {
            const extended = { ...full, detailsLoaded: true } as Business & { detailsLoaded: true };
            businessCacheRef.current.set(business.id, extended);
            businessToReturn = extended;
          }
        }
      }
      callbackRefs.current.onBusinessClick(businessToReturn);
    } catch (err) {
      console.warn('handleBusinessClick error', err);
      callbackRefs.current.onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails]);

  // Clean, consistent viewport handler — supports neighborhood polygons
  const handleViewportChange = useCallback(async () => {
    if (!mapRef.current || !mapLoaded || isLoadingRef.current) return;

    const map = mapRef.current;
    const zoom = map.getZoom();

    // If a neighborhood polygon is active => compute bounds from polygon, then load for that neighborhood
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      const { boundary, name } = searchFilters.neighborhoodFilter;
      const lats = boundary.map((p: any) => p.lat);
      const lons = boundary.map((p: any) => p.lon);

      const bounds: Bounds = {
        north: Math.max(...lats) + 0.015,
        south: Math.min(...lats) - 0.015,
        east: Math.max(...lons) + 0.02,
        west: Math.min(...lons) - 0.02
      };

      const businessLimit = getBusinessLimitForViewport(zoom, bounds);
      try {
        const converted = featureToLatLon(boundaryPoint);
        const neighborhoodBusinesses = await loadBusinessesInViewport?.(converted);
        if (Array.isArray(neighborhoodBusinesses) && neighborhoodBusinesses.length) {
          // optional: clip results precisely to polygon
          const polygonCoords = boundary.map((p: any) => [p.lon, p.lat]);
          const turfPoly = turf.polygon([polygonCoords]);
          const clipped = neighborhoodBusinesses.filter(b => {
            if (!b?.position) return false;
            const pt = turf.point([b.position.lng, b.position.lat]);
            return isPointInPolygon(pt, turfPoly);
          });
          businessCacheRef.current.addMultiple(clipped);
        }
      } catch (err) {
        console.error('Error loading neighborhood businesses', err);
      }
      return; // stop here (don't also request rectangular viewport)
    }

    // Regular rectangular viewport
    const currentBounds = map.getBounds();
    const bounds: Bounds = {
      north: currentBounds.getNorth(),
      south: currentBounds.getSouth(),
      east: currentBounds.getEast(),
      west: currentBounds.getWest()
    };
    const businessLimit = getBusinessLimitForViewport(zoom, bounds);
    try {
      const viewportBusinesses = await loadBusinessesInViewport?.(bounds, businessLimit);
      if (Array.isArray(viewportBusinesses) && viewportBusinesses.length) {
        businessCacheRef.current.addMultiple(viewportBusinesses);
      }
    } catch (err) {
      console.error('Error loading viewport businesses', err);
    }
  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport, searchFilters]);

  // DeckGL layers (scatterplot only). Pass the layer factory the object it expects.
  const deckGLLayers = useMemo(() => {
    try {
      const cached = businessCacheRef.current.getAll();
      const hookBusinesses = businesses || [];
      const all: (Business & { detailsLoaded?: boolean })[] = [...cached];

      hookBusinesses.forEach(h => { if (!all.some(a => a.id === h.id)) all.push(h as any); });

      if (!all.length) return [];

      // usable coords
      let businessesToRender = all.filter(b => b && b.position && typeof b.position.lat === 'number' && typeof b.position.lng === 'number');

      if (mapRef.current && mapLoaded) {
        const currentBounds = mapRef.current.getBounds();

        // if neighborhood polygon active, clip to polygon first
        if (searchFilters?.neighborhoodFilter?.boundary?.length) {
          const polygonCoords = searchFilters.neighborhoodFilter.boundary.map((p: any) => [p.lon, p.lat]);
          const turfPoly = turf.polygon([polygonCoords]);
          businessesToRender = businessesToRender.filter(b => {
            const pt = turf.point([b.position.lng, b.position.lat]);
            return isPointInPolygon(pt, turfPoly);
          });
        } else {
          // visible + buffer logic
          const visible = businessesToRender.filter(b => {
            const latBuffer = (currentBounds.getNorth() - currentBounds.getSouth()) * 0.2;
            const lngBuffer = (currentBounds.getEast() - currentBounds.getWest()) * 0.2;
            return b.position.lat <= currentBounds.getNorth() + latBuffer &&
                   b.position.lat >= currentBounds.getSouth() - latBuffer &&
                   b.position.lng <= currentBounds.getEast() + lngBuffer &&
                   b.position.lng >= currentBounds.getWest() - lngBuffer;
          });

          const buffer = businessesToRender.filter(b => !visible.includes(b)).slice(0, 1000);
          businessesToRender = [...visible, ...buffer];
        }

        // dedupe
        const set = new Set<string>();
        businessesToRender = businessesToRender.filter(b => {
          if (set.has(b.id)) return false;
          set.add(b.id);
          return true;
        });
      }

      // create the scatterplot layer (pass object)
      return [
        createBusinessScatterplotLayer({
          businesses: businessesToRender,
          selectedBusinessId: selectedBusiness?.id,
          onBusinessClick: handleBusinessClick
        })
      ];
    } catch (err) {
      console.error('Error building deck layers', err);
      return [];
    }
  }, [businesses, selectedBusiness?.id, handleBusinessClick, mapLoaded, searchFilters]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => { mapRef.current?.resize(); };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // initialize map once
  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;

      const vectorSource = {
        type: 'vector' as const,
        tiles: [`${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`],
        minzoom: 10,
        maxzoom: 16,
        scheme: 'xyz' as const
      };

      const style = {
        version: 8 as const,
        sources: { 'nyc-tiles': vectorSource },
        layers: [
          { id: 'background', type: 'background' as const, paint: { 'background-color': '#F5F5DC' } }
        ]
      } as any; // MapLibre's typings can be picky; keep as any here to avoid typed mismatch

      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current!,
        style,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: false
      });

      mapRef.current = mapInstance;
      handleViewportChangeRef.current = handleViewportChange;

      mapInstance.on('error', (e) => console.error('Map error', e.error || e));
      mapInstance.on('load', () => {
        setMapLoaded(true);
        callbackRefs.current.onMapLoaded?.();
        if (!layersAddedRef.current) addVectorLayers(mapInstance);

        // initial load after small delay
        setTimeout(() => { handleViewportChangeRef.current(); }, 500);
      });

      // fallback if load event didn't fire timely
      setTimeout(() => {
        if (!mapInstance.loaded()) {
          setMapLoaded(true);
          callbackRefs.current.onMapLoaded?.();
          setTimeout(() => handleViewportChangeRef.current(), 100);
        }
      }, 2000);

      // events
      const debouncedMove = (() => {
        let t: any = 0;
        return () => {
          clearTimeout(t);
          t = setTimeout(() => handleViewportChangeRef.current(), 150);
        };
      })();

      mapInstance.on('moveend', () => handleViewportChangeRef.current());
      mapInstance.on('zoomend', () => handleViewportChangeRef.current());
      mapInstance.on('move', debouncedMove);

      mapInstance.on('sourcedata', (e: any) => {
        if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
          addVectorLayers(mapInstance);
        }
      });

      // deck overlay
      setTimeout(() => {
        if (mapRef.current && !overlayInstance) {
          overlayInstance = new MapboxOverlay({ interleaved: true, pickingRadius: 10 });
          mapRef.current.addControl(overlayInstance);
          setDeckOverlay(overlayInstance);
          setOverlayReady(true);
        }
      }, 500);
    };

    initializeMap();

    return () => {
      try {
        if (overlayInstance && mapRef.current) { mapRef.current.removeControl(overlayInstance); overlayInstance = null; }
      } catch {}
      try { mapRef.current?.remove(); } catch {}
      businessCacheRef.current.clear();
      layersAddedRef.current = false;
      setMapLoaded(false);
      setDeckOverlay(null);
      setOverlayReady(false);
      mapRef.current = null;
    };
  }, []); // run once

  // update deck layers
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    try {
      deckOverlay.setProps({ layers: deckGLLayers });
    } catch (err) {
      console.error('Updating deck overlay failed', err);
    }
  }, [deckGLLayers, deckOverlay, overlayReady]);

  // initial load trigger when map ready
  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      setTimeout(() => handleViewportChangeRef.current(), 500);
    }
  }, [mapLoaded]);

  // center on neighborhood center if provided
  useEffect(() => {
    if (!mapRef.current || !neighborhoodCenter) return;
    mapRef.current.flyTo({ center: [neighborhoodCenter.lon, neighborhoodCenter.lat], zoom: 14, duration: 2000 });
  }, [neighborhoodCenter]);

  // center/load neighborhood businesses on searchFilters change (stable)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhoodFilter) return;
    const load = async () => { handleViewportChangeRef.current(); };
    setTimeout(load, 500);
  }, [mapLoaded, searchFilters?.neighborhoodFilter]);

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
