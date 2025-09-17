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

interface Bounds { north: number; south: number; east: number; west: number; }

// Singleton overlay
let overlayInstance: MapboxOverlay | null = null;

// Business cache
class BusinessCache {
  private cache = new Map<string, Business & { detailsLoaded?: boolean }>();
  private maxSize: number;
  constructor(maxSize = 10000) { this.maxSize = maxSize; }
  set(id: string, business: Business & { detailsLoaded?: boolean }) {
    if (this.cache.size >= this.maxSize) {
      Array.from(this.cache.keys()).slice(0, Math.floor(this.maxSize * 0.1)).forEach(k => this.cache.delete(k));
    }
    this.cache.set(id, business);
  }
  get(id: string) { const b = this.cache.get(id); if (b) { this.cache.delete(id); this.cache.set(id, b); } return b; }
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
  const isLoadingRef = useRef(false);

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  const businessesHook = useViewportBusinesses(searchFilters);
  const mapDataHook = useViewportMapData();
  const { businesses: rawBusinesses, loadBusinessesInViewport, fetchFullBusinessDetails } = businessesHook;
  const businesses = Array.isArray(rawBusinesses) ? rawBusinesses : [];

  // Add businesses to cache
  useEffect(() => { if (businesses.length) businessCacheRef.current.addMultiple(businesses); }, [businesses]);

  // Business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business || !callbackRefs.current.onBusinessClick) return;
    try {
      let result = business;
      if (business.id && fetchFullBusinessDetails && !business.id.startsWith('vector_')) {
        const cached = businessCacheRef.current.get(business.id);
        if (cached?.detailsLoaded) result = cached;
        else {
          const full = await fetchFullBusinessDetails(business.id);
          if (full) { full.detailsLoaded = true; businessCacheRef.current.set(business.id, full); result = full; }
        }
      }
      callbackRefs.current.onBusinessClick(result);
    } catch { callbackRefs.current.onBusinessClick(business); }
  }, [fetchFullBusinessDetails]);

  // Memoized DeckGL layers
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

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8 as 8, // ✅ TS fix
          sources: {
            'nyc-tiles': {
              type: 'vector',
              tiles: [`${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`],
              minzoom: 10,
              maxzoom: 16,
              scheme: 'xyz',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#F5F5DC' } },
          ],
        } as maplibregl.StyleSpecification,
        center: [-73.97, 40.78],
        zoom: 12,
      });

      mapRef.current = map;

      map.on('load', () => {
        console.log('✅ Map loaded, adding custom layers...');
        addVectorLayers(map);
      });
    }
  }, [addVectorLayers]);


  // Handle viewport changes
  const handleViewportChangeRef = useRef<() => void>(() => {});
  handleViewportChangeRef.current = useCallback(async () => {
    if (!mapRef.current || !loadBusinessesInViewport) return;
    if (searchFilters?.neighborhoodFilter?.boundary?.length) {
      const b = searchFilters.neighborhoodFilter.boundary;
      const bounds: Bounds = { north: Math.max(...b.map(p => p.lat)), south: Math.min(...b.map(p => p.lat)), east: Math.max(...b.map(p => p.lon)), west: Math.min(...b.map(p => p.lon)) };
      await loadBusinessesInViewport(bounds, 1000);
    }
  }, [loadBusinessesInViewport, searchFilters]);

  // Update DeckGL layers
  useEffect(() => { if (deckOverlay) deckOverlay.setProps({ layers: deckGLLayers }); }, [deckOverlay, deckGLLayers]);

  return <div ref={mapContainerRef} className="map-container maplibre-map" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
