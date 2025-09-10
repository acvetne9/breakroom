import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
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

let overlayInstance: MapboxOverlay | null = null;

const createGridSampling = (bounds: any, businesses: Business[], maxBusinesses: number): Business[] => {
  if (!businesses || businesses.length <= maxBusinesses) return businesses;

  const gridSize = Math.ceil(Math.sqrt(maxBusinesses / 4));
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;

  const grid: Business[][][] = [];
  for (let i = 0; i < gridSize; i++) {
    grid[i] = [];
    for (let j = 0; j < gridSize; j++) grid[i][j] = [];
  }

  businesses.forEach(b => {
    if (!b?.position?.lat || !b?.position?.lng) return;
    const latIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((b.position.lat - bounds.south) / latStep)));
    const lngIndex = Math.min(gridSize - 1, Math.max(0, Math.floor((b.position.lng - bounds.west) / lngStep)));
    grid[latIndex][lngIndex].push(b);
  });

  const businessesPerCell = Math.ceil(maxBusinesses / (gridSize * gridSize));
  const result: Business[] = [];
  grid.forEach(row => {
    row.forEach(cell => {
      if (cell.length > 0) {
        result.push(...cell.sort(() => Math.random() - 0.5).slice(0, businessesPerCell));
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
  const [businessCache, setBusinessCache] = useState<Record<string, Business>>({});
  const isLoadingBusinessesRef = useRef(false);
  const lastViewportRef = useRef<{ bounds: { north: number; south: number; east: number; west: number }; timestamp: number } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onBusinessClickRef = useRef(onBusinessClick);
  const onMapLoadedRef = useRef(onMapLoaded);

  useEffect(() => {
    onBusinessClickRef.current = onBusinessClick;
    onMapLoadedRef.current = onMapLoaded;
  }, [onBusinessClick, onMapLoaded]);

  const mapDataHook = useViewportMapData();
  const businessesHook = useViewportBusinesses(searchFilters);

  const { businesses, loadBusinessesInViewport } = businessesHook;

  const mergeBusinessesIntoCache = useCallback((newBusinesses: Business[]) => {
    setBusinessCache(prev => {
      const updated = { ...prev };
      newBusinesses.forEach(b => {
        if (b && b.id) updated[b.id] = b;
      });
      return updated;
    });
  }, []);

  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !onBusinessClickRef.current) return;
    onBusinessClickRef.current(business);
  }, []);

  const getBusinessLimitForViewport = useCallback((zoom: number, bounds: any) => {
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;
    const avgLat = (bounds.north + bounds.south) / 2;
    const latKm = latDiff * 111;
    const lngKm = lngDiff * 111 * Math.cos(avgLat * Math.PI / 180);
    const areaKm2 = latKm * lngKm;
    let targetDensity = zoom >= 16 ? 500 : zoom >= 14 ? 250 : zoom >= 12 ? 100 : 50;
    const maxLimit = isMobile ? 5000 : 10000;
    const minLimit = 300;
    return Math.max(minLimit, Math.min(maxLimit, Math.ceil(areaKm2 * targetDensity)));
  }, [isMobile]);

  const handleViewportChange = useCallback(async () => {
    if (!map || !mapLoaded || !loadBusinessesInViewport || isLoadingBusinessesRef.current) return;
    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const now = Date.now();

      const expansion = 0.05;
      const latDiff = bounds.getNorth() - bounds.getSouth();
      const lngDiff = bounds.getEast() - bounds.getWest();
      const expandedBounds = {
        north: bounds.getNorth() + latDiff * expansion,
        south: bounds.getSouth() - latDiff * expansion,
        east: bounds.getEast() + lngDiff * expansion,
        west: bounds.getWest() - lngDiff * expansion,
      };

      const businessLimit = getBusinessLimitForViewport(zoom, expandedBounds);
      isLoadingBusinessesRef.current = true;

      const rawBusinesses = await loadBusinessesInViewport(expandedBounds, businessLimit * 1.5);
      const visibleBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };

      const [inside, outside] = (rawBusinesses || []).reduce(
        (acc, b) => {
          if (!b?.position) return acc;
          if (b.position.lat <= visibleBounds.north && b.position.lat >= visibleBounds.south &&
              b.position.lng <= visibleBounds.east && b.position.lng >= visibleBounds.west) {
            acc[0].push(b);
          } else {
            acc[1].push(b);
          }
          return acc;
        }, [[], []] as [Business[], Business[]]
      );

      const insideSampled = createGridSampling(visibleBounds, inside, businessLimit);
      const outsideSampled = createGridSampling(expandedBounds, outside, Math.floor(businessLimit * 0.3));

      mergeBusinessesIntoCache([...insideSampled, ...outsideSampled].slice(0, businessLimit));
      lastViewportRef.current = { bounds: expandedBounds, timestamp: now };
      isLoadingBusinessesRef.current = false;
    } catch (error) {
      console.error('Viewport change error:', error);
      isLoadingBusinessesRef.current = false;
    }
  }, [map, mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport, mergeBusinessesIntoCache]);

  const deckGLLayers = useMemo(() => {
    const allBusinesses = Object.values(businessCache);
    if (!allBusinesses.length) return [];
    return [createBusinessScatterplotLayer({
      businesses: allBusinesses,
      selectedBusinessId: selectedBusiness?.id,
      onBusinessClick: handleBusinessClick
    })];
  }, [businessCache, selectedBusiness?.id, handleBusinessClick]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || map) return;

    const baseStyle = {
      version: 8 as const,
      sources: {
        'nyc-tiles': { type: 'vector' as const, tiles: [`${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`], minzoom: 10, maxzoom: 16, scheme: 'xyz' as const }
      },
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#F5F5DC' } }]
    };

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: baseStyle,
      center: [-73.986104, 40.715245],
      zoom: 12.77,
      maxZoom: 18,
      minZoom: 9,
      renderWorldCopies: false,
      attributionControl: false
    });

    mapInstance.on('load', () => {
      setMapLoaded(true);
      if (onMapLoadedRef.current) onMapLoadedRef.current();
    });

    setMap(mapInstance);
    return () => mapInstance.remove();
  }, []);

  // Map move/zoom handlers
  useEffect(() => {
    if (!map || !mapLoaded) return;
    const handler = () => handleViewportChange();
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // DeckGL overlay
  useEffect(() => {
    if (!map || !mapLoaded || deckOverlay) return;
    let overlay = overlayInstance;
    if (!overlay) overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    overlayInstance = overlay;

    try { map.addControl(overlay); } catch {}
    setDeckOverlay(overlay);
    setOverlayReady(true);
  }, [map, mapLoaded, deckOverlay]);

  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    updateTimeoutRef.current = setTimeout(() => deckOverlay.setProps({ layers: deckGLLayers }), 100);
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // Landmarks
  useEffect(() => {
    if (!map || !mapLoaded) return;
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    const newMarkers = landmarks.map(l => {
      const el = document.createElement('div');
      el.textContent = l.emoji;
      Object.assign(el.style, { fontSize: '16px', lineHeight: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' } as CSSStyleDeclaration);
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([l.lng, l.lat]).addTo(map);
    });
    landmarkMarkersRef.current = newMarkers;
    return () => landmarkMarkersRef.current.forEach(m => m.remove());
  }, [landmarks, map, mapLoaded]);

  // Initial viewport load
  useEffect(() => {
    const timer = setTimeout(() => handleViewportChange(), 500);
    return () => clearTimeout(timer);
  }, [map, mapLoaded, handleViewportChange]);

  // Merge new businesses into cache
  useEffect(() => { if (businesses?.length) mergeBusinessesIntoCache(businesses); }, [businesses, mergeBusinessesIntoCache]);

  return <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', zIndex: 1, backgroundColor: '#B3E5FC' }} />;
};

export default MapLibreMap;
