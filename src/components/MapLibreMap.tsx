import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox'; // use this package
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { createTileBlobUrl } from '@/utils/tileDecompression';
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

// singleton overlay
let overlayInstance: MapboxOverlay | null = null;

// Convert GeoJSON Point Feature -> { lat, lon }
const featureToLatLon = (feature: Feature<Point> | { lat: number; lon: number }) => {
  if ('geometry' in feature && feature.geometry?.type === 'Point') {
    return { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
  }
  if ('lat' in feature && 'lon' in feature) return feature;
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

  getAll() {
    const all = Array.from(this.cache.values());
    console.log('🏢 getAll returning', all.length, 'businesses');
    return all;
  }

  addMultiple(businesses: Business[]) {
    console.log('🏢 BusinessCache.addMultiple called with', businesses.length, 'businesses');
    if (businesses.length > 0) {
      console.log('🏢 Sample business being added:', {
        id: businesses[0].id,
        name: businesses[0].name,
        position: businesses[0].position
      });
    }
    businesses.forEach(b => {
      if (!b?.id) console.warn('Skipping business without id', b);
      else this.set(b.id, b as any);
    });
    console.log('Sample position:', businesses[0]?.position);
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
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    if (businesses && businesses.length) {
      console.log('🏢 Adding businesses to cache:', businesses.length);
      console.log('🏢 Sample business data:', businesses[0]);
      businessCacheRef.current.addMultiple(businesses);
      setCacheVersion(prev => prev + 1); // triggers deckGLLayers useMemo
      handleViewportChangeRef.current();
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);
  
  // vector layers (styling restored exactly as requested)
  const addVectorLayers = useCallback((map: maplibregl.Map) => {
    try {
      const layers = [
    // Base land polygons
    {
      id: 'nyc-land',
      type: 'fill' as const,
      source: 'nyc-tiles',
      'source-layer': 'examplepoints',
      layout: {},
      paint: {
        'fill-color': '#F5F5DC',
        'fill-opacity': 1.0
      },
      filter: ['all',
        ['==', ['geometry-type'], 'Polygon']
      ] as any
    },
  
    // Parks, cemeteries, and recreation spaces
    {
      id: 'nyc-green-spaces',
      type: 'fill' as const,
      source: 'nyc-tiles',
      'source-layer': 'examplepoints',
      layout: {},
      paint: {
        'fill-color': '#87C17A',
        'fill-opacity': 1.0
      },
      filter: ['all',
        ['==', ['geometry-type'], 'Polygon'],
        ['any',
          // Leisure → park or recreation ground
          ['all', ['has', 'leisure'], ['in', ['get', 'leisure'], ['literal', ['park', 'recreation_ground']]]],
  
          // Landuse → cemetery or recreation ground
          ['all', ['has', 'landuse'], ['in', ['get', 'landuse'], ['literal', ['cemetery', 'recreation_ground']]]],
  
          // Amenity → cemetery or graveyard
          ['all', ['has', 'amenity'], ['in', ['get', 'amenity'], ['literal', ['cemetery', 'grave_yard']]]],
  
          // Named features containing cemetery/graveyard
          ['all', ['has', 'name'], ['in', ['get', 'name'], ['literal', ['cemetery', 'Cemetery', 'graveyard', 'Graveyard']]]],
  
          // Place or historic tags
          ['all', ['has', 'place'], ['==', ['get', 'place'], 'cemetery']],
          ['all', ['has', 'historic'], ['==', ['get', 'historic'], 'cemetery']]
        ]
      ] as any
    },
  
    // Water polygons
    {
      id: 'nyc-water',
      type: 'fill' as const,
      source: 'nyc-tiles',
      'source-layer': 'examplepoints',
      layout: {},
      paint: {
        'fill-color': '#6CA4E1',
        'fill-opacity': 1.0
      },
      filter: ['all',
        ['==', ['geometry-type'], 'Polygon'],
        ['has', 'natural']
      ] as any
    },
  
    // Roads (line geometry)
    {
      id: 'nyc-roads',
      type: 'line' as const,
      source: 'nyc-tiles',
      'source-layer': 'examplepoints',
      layout: {},
      paint: {
        'line-color': '#666666',
        'line-width': ['interpolate', ['linear'], ['zoom'],
          10, 0.5,
          14, 1.5,
          16, 3
        ],
        'line-opacity': 0.8
      },
      filter: ['all',
        ['==', ['geometry-type'], 'LineString'],
        ['has', 'highway']
      ] as any
    },
  
    // Road labels (symbols placed along roads)
    {
      id: 'nyc-road-labels',
      type: 'symbol' as const,
      source: 'nyc-tiles',
      'source-layer': 'examplepoints',
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ''],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'],
          12, 9,
          16, 12
        ],
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
        'text-opacity': ['interpolate', ['linear'], ['zoom'],
          12, 0.6,
          16, 1
        ]
      },
      filter: ['all',
        ['==', ['geometry-type'], 'LineString'],
        ['has', 'name'],
        ['has', 'highway'],
        ['!=', ['get', 'name'], '']
      ] as any,
      minzoom: 12
    }
  ];

  console.log('🗺️ Adding vector layers...');
  layers.forEach(layer => {
    try {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer as any);
        console.log(`✅ Layer added: ${layer.id}`);
      } else {
        console.log(`⚠️ Layer already exists, skipping: ${layer.id}`);
      }
    } catch (err) {
      console.error(`❌ Error adding layer ${layer.id}:`, err);
    }
  });

  layersAddedRef.current = true;
  console.log('🗺️ All vector layers processed');

  } catch (err) {
    console.error('❌ addVectorLayers error:', err);
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

  // Handle viewport change
  const handleViewportChange = useCallback(async () => {
    if (!mapRef.current || !mapLoaded || isLoadingRef.current) return;
  
    const map = mapRef.current;
    const zoom = map.getZoom();
  
    let bounds: Bounds;
  
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      const boundary = searchFilters.neighborhoodFilter.boundary;
      const polygonCoords = boundary.map((p: any) => [featureToLatLon(p).lon, featureToLatLon(p).lat]);
      const turfPoly = turf.polygon([polygonCoords]);
    
      try {
        businessCacheRef.current.clear();
    
        const neighborhoodBusinesses = await loadBusinessesInViewport?.(boundary, 10000);
        
        // Fallback: filter client-side with Turf if API does not fully support polygons
        let filteredBusinesses = neighborhoodBusinesses || [];
        filteredBusinesses = filteredBusinesses.filter(b => {
          if (!b?.position) return false;
          const pt = turf.point([b.position.lng, b.position.lat]);
          return turf.booleanPointInPolygon(pt, turfPoly);
        });
    
        businessCacheRef.current.addMultiple(filteredBusinesses);
        setCacheVersion(prev => prev + 1);
    
      } catch (err) {
        console.error('Error loading neighborhood businesses', err);
      }
    }

    // For normal rectangular viewport
    const currentBounds = map.getBounds();
    bounds = {
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

  const deckGLLayers = useMemo(() => {
    const all = businessCacheRef.current.getAll();
    console.log('🎯 Cache has', all.length, 'businesses');
    if (!all.length) return [];
  
    // Convert raw boundary features into [lat, lon] for turf
    let neighborhoodBoundary: { lat: number; lon: number }[] | undefined;
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      neighborhoodBoundary = searchFilters.neighborhoodFilter.boundary.map((p: any) => featureToLatLon(p));
    }
  
    // Filter businesses inside polygon if neighborhoodBoundary exists
    let businessesToRender = all.filter(b => b?.position?.lat != null && b?.position?.lng != null);
    if (neighborhoodBoundary?.length) {
      const polygonCoords = neighborhoodBoundary.map(p => [p.lon, p.lat]);
      const turfPoly = turf.polygon([polygonCoords]);
      businessesToRender = businessesToRender.filter(b => {
        const pt = turf.point([b.position.lng, b.position.lat]);
        return turf.booleanPointInPolygon(pt, turfPoly);
      });
    }
  
    console.log('🎯 Rendering', businessesToRender.length, 'businesses');
    if (!businessesToRender.length) return [];
  
    return [
      createBusinessScatterplotLayer({
        businesses: businessesToRender,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
        neighborhoodBoundary // pass it to the layer for future reactivity
      })
    ];
  }, [selectedBusiness?.id, handleBusinessClick, mapLoaded, searchFilters, cacheVersion]);

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
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf", // 👈 required
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
    console.log('🎯 Updating DeckGL layers, business count:', deckGLLayers.length > 0 ? deckGLLayers[0]?.props?.data?.length || 0 : 0);
    deckOverlay.setProps({ layers: deckGLLayers });
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // initial load trigger when map ready
  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      setTimeout(() => handleViewportChangeRef.current(), 500);
    }
  }, [mapLoaded]);

  // center/load neighborhood center
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !searchFilters?.neighborhoodFilter || !neighborhoodCenter) return;
  
    const isUserTriggered = !!selectedBusiness; // or you can pass a dedicated flag if needed
  
    if (isUserTriggered) {
      // fly immediately for user clicks
      mapRef.current.flyTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 16,
        essential: true,
      });
    } else {
      // automatic fly (e.g., on initial search/filter load) waits 2s
      const timeout = setTimeout(() => {
        mapRef.current!.flyTo({
          center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
          zoom: 14,
          duration: 2000, // smooth 2-second fly
          essential: true,
        });
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [searchFilters?.neighborhoodFilter, neighborhoodCenter, mapLoaded, selectedBusiness]);

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