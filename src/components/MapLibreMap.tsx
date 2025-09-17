import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { isPointInPolygon } from '@/utils/nyc_neighborhoods';
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

// Singleton DeckGL overlay
let overlayInstance: MapboxOverlay | null = null;

class BusinessCache {
  private cache = new Map<string, Business & { detailsLoaded?: boolean }>();
  private maxSize: number;

  constructor(maxSize = 10000) { this.maxSize = maxSize; }

  set(id: string, business: Business & { detailsLoaded?: boolean }) {
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxSize * 0.1));
      keysToDelete.forEach(k => this.cache.delete(k));
    }
    this.cache.set(id, business);
  }

  get(id: string) {
    const b = this.cache.get(id);
    if (b) { this.cache.delete(id); this.cache.set(id, b); }
    return b;
  }

  getAll() { return Array.from(this.cache.values()); }
  addMultiple(businesses: Business[]) { businesses.forEach(b => b?.id && this.set(b.id, b)); }
  clear() { this.cache.clear(); }
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick, selectedBusiness, landmarks = [], onMapLoaded, onBusinessesLoaded,
  searchFilters, neighborhoodCenter, enableClustering = true
}) => {
  const isMobile = useIsMobile();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const businessCacheRef = useRef(new BusinessCache(isMobile ? 10000 : 20000));
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  const mapDataHook = useViewportMapData();
  const businessesHook = useViewportBusinesses(searchFilters);
  const { businesses: rawBusinesses, loadBusinessesInViewport, fetchFullBusinessDetails } = businessesHook;
  const businesses = Array.isArray(rawBusinesses) ? rawBusinesses : [];

  // Cache businesses
  useEffect(() => { if (businesses.length) businessCacheRef.current.addMultiple(businesses); }, [businesses]);

  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !callbackRefs.current.onBusinessClick) return;
    try {
      let result = business;
      if (business.id && fetchFullBusinessDetails && !business.id.startsWith('vector_')) {
        const cached = businessCacheRef.current.get(business.id);
        if (cached?.detailsLoaded) result = cached;
        else {
          const fullBusiness = await fetchFullBusinessDetails(business.id);
          if (fullBusiness) { fullBusiness.detailsLoaded = true; businessCacheRef.current.set(business.id, fullBusiness); result = fullBusiness; }
        }
      }
      callbackRefs.current.onBusinessClick(result);
    } catch { callbackRefs.current.onBusinessClick(business); }
  }, [fetchFullBusinessDetails]);

  const deckGLLayers = useMemo(() => {
    const cached = businessCacheRef.current.getAll();
    const all = [...cached, ...businesses.filter(b => !cached.some(c => c.id === b.id))];
    let toRender = all.filter(b => b?.position?.lat != null && b?.position?.lng != null);

    if (mapRef.current && mapLoaded && searchFilters?.neighborhoodFilter?.boundary?.length) {
      const poly = turf.polygon([searchFilters.neighborhoodFilter.boundary.map(p => [p.lon, p.lat])]);
      toRender = toRender.filter(b => turf.booleanPointInPolygon(turf.point([b.position.lng, b.position.lat]), poly));
    }

    return [createBusinessScatterplotLayer({ businesses: toRender, selectedBusinessId: selectedBusiness?.id, onBusinessClick: handleBusinessClick })];
  }, [businesses, selectedBusiness?.id, handleBusinessClick, mapLoaded, searchFilters]);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const style = {
      version: 8,
      sources: {
        'nyc-tiles': { type: 'vector', tiles: [`${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`], minzoom: 10, maxzoom: 16, scheme: 'xyz' }
      },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#F5F5DC' } }]
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-73.986104, 40.715245],
      zoom: 12.77,
      maxZoom: 18,
      minZoom: 9,
      renderWorldCopies: false,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', async () => {
      setMapLoaded(true);
      callbackRefs.current.onMapLoaded?.();
      // Add DeckGL overlay
      if (!overlayInstance) {
        overlayInstance = new MapboxOverlay({ interleaved: true });
        map.addControl(overlayInstance);
        setDeckOverlay(overlayInstance);
        setOverlayReady(true);
      }
      // Load businesses
      setTimeout(() => handleViewportChangeRef.current?.(), 500);
    });
  }, []);

  const handleViewportChangeRef = useRef<() => void>(() => {});
  handleViewportChangeRef.current = useCallback(async () => {
    if (!mapRef.current || !loadBusinessesInViewport) return;
    const boundsObj: Bounds = { north: 40.92, south: 40.55, east: -73.70, west: -74.25 }; // placeholder
    await loadBusinessesInViewport(boundsObj, 1000);
  }, [loadBusinessesInViewport]);

  // Initialize map once
  useEffect(() => { initializeMap(); return () => { mapRef.current?.remove(); overlayInstance = null; }; }, []);

  // Update DeckGL
  useEffect(() => { if (deckOverlay) deckOverlay.setProps({ layers: deckGLLayers }); }, [deckOverlay, deckGLLayers]);

  return <div ref={mapContainerRef} className="map-container maplibre-map" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
