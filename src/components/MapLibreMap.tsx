import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
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

interface VectorTileFeature extends GeoJSONFeature {
  sourceLayer?: string;
}

// Singleton overlay for performance
let overlayInstance: MapboxOverlay | null = null;

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
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [currentZoom, setCurrentZoom] = useState(12);

  // Safely initialize hooks
  let mapDataHook;
  let businessesHook;

  try {
    mapDataHook = useViewportMapData();
    businessesHook = useViewportBusinesses(searchFilters, currentZoom);
  } catch (error) {
    console.error('Error initializing hooks:', error);
    mapDataHook = { isProcessing: false, setIsProcessing: () => {}, loadAllDataCenterOut: () => {} };
    businessesHook = {
      businesses: [],
      loading: false,
      loadBusinessesInViewport: () => {},
      fetchFullBusinessDetails: () => Promise.resolve(null),
      clusterBusinesses: () => {},
      isSearching: false
    };
  }

  const { isProcessing, setIsProcessing } = mapDataHook;
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clusterBusinesses,
    isSearching
  } = businessesHook;

  // Business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business) return;

    console.log('🎯 MapLibreMap handleBusinessClick called:', business.name, business.id);

    if (onBusinessClick) {
      if (fetchFullBusinessDetails && business.id && !business.id.startsWith('vector_')) {
        try {
          const fullBusiness = await fetchFullBusinessDetails(business.id);
          onBusinessClick(fullBusiness || business);
        } catch (error) {
          console.warn('Failed to fetch full business details, using basic info:', error);
          onBusinessClick(business);
        }
      } else {
        onBusinessClick(business);
      }
    }
  }, [onBusinessClick, fetchFullBusinessDetails]);

  // Viewport change handler
  const handleViewportChange = useCallback(() => {
    if (!map || !mapLoaded) return;

    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };

      // Increase dot limits
      const baseLimit = isMobile ? 20000 : 50000;
      const zoomFactor = Math.max(1, Math.floor(zoom - 10));
      const businessLimit = baseLimit * zoomFactor;

      loadBusinessesInViewport(viewportBounds, businessLimit, false);
      setCurrentZoom(zoom);
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Scatterplot layers (only source of business dots now)
  const deckGLLayers = useMemo(() => {
    if (!businesses || businesses.length === 0) return [];

    try {
      return [
        createBusinessScatterplotLayer({
          businesses: businesses as Business[],
          selectedBusinessId: selectedBusiness?.id,
          onBusinessClick: handleBusinessClick,
        })
      ];
    } catch (error) {
      console.error('Error creating DeckGL layers:', error);
      return [];
    }
  }, [businesses, selectedBusiness?.id, handleBusinessClick]);

  // DeckGL overlay init
  const initializeDeckOverlay = useMemo(() => {
    if (!map || !mapLoaded) return null;

    let overlay = overlayInstance;
    if (!overlay) {
      try {
        overlay = new MapboxOverlay({ interleaved: true, layers: [] });
        overlayInstance = overlay;
      } catch (error) {
        console.error('Error creating MapboxOverlay:', error);
        return null;
      }
    }

    try {
      map.addControl(overlay as any);
      setOverlayReady(true);
    } catch {
      setOverlayReady(true);
    }

    return overlay;
  }, [map, mapLoaded]);

  useEffect(() => {
    if (initializeDeckOverlay) {
      setDeckOverlay(initializeDeckOverlay);
    }
  }, [initializeDeckOverlay]);

  // Update DeckGL layers
  useEffect(() => {
    if (!deckOverlay || !overlayReady) return;

    try {
      deckOverlay.setProps({ layers: deckGLLayers });
      console.log(`🎯 Updated deck.gl with ${deckGLLayers.length} layers`);
    } catch (error) {
      console.error('Error updating DeckGL layers:', error);
    }
  }, [deckOverlay, overlayReady, deckGLLayers]);

  // Zoom to selected business
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;

    try {
      map.easeTo({
        center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 800
      });
    } catch (error) {
      console.error('Error zooming to selected business:', error);
    }
  }, [selectedBusiness?.id, map, mapLoaded]);

  // Center on neighborhood
  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;

    try {
      map.easeTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 14,
        duration: 1000
      });
    } catch (error) {
      console.error('Error centering on neighborhood:', error);
    }
  }, [neighborhoodCenter, map, mapLoaded]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || map) return;

    let mapInstance: maplibregl.Map | null = null;

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;

    const baseStyle = {
      version: 8 as const,
      sources: {
        'nyc-tiles': {
          type: 'vector' as const,
          tiles: [absoluteTilesUrl],
          minzoom: 10,
          maxzoom: 16,
          scheme: 'xyz' as const
        }
      },
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      layers: [
        {
          id: 'background',
          type: 'background' as const,
          paint: { 'background-color': '#F5F5DC' }
        }
      ]
    };

    try {
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: false
      });

      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
    } catch (error) {
      console.error('❌ Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      setMapLoaded(true);

      if (onMapLoaded) onMapLoaded();

      // Add static layers (land, green spaces, water, roads) — but no business dots here
      try {
        const sourceLayer = 'examplepoints';

        const layersToAdd = [
          {
            id: 'nyc-land',
            type: 'fill' as const,
            source: 'nyc-tiles',
            'source-layer': sourceLayer,
            paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
            filter: ['==', ['geometry-type'], 'Polygon']
          },
          {
            id: 'nyc-green-spaces',
            type: 'fill' as const,
            source: 'nyc-tiles',
            'source-layer': sourceLayer,
            paint: { 'fill-color': '#87C17A', 'fill-opacity': 1.0 },
            filter: [
              'all',
              ['==', ['geometry-type'], 'Polygon'],
              ['any',
                ['==', ['get', 'leisure'], 'park'],
                ['==', ['get', 'landuse'], 'cemetery'],
                ['==', ['get', 'amenity'], 'cemetery'],
                ['==', ['get', 'amenity'], 'grave_yard']
              ]
            ]
          },
          {
            id: 'nyc-water',
            type: 'fill' as const,
            source: 'nyc-tiles',
            'source-layer': sourceLayer,
            paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
            filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
          },
          {
            id: 'nyc-waterways',
            type: 'line' as const,
            source: 'nyc-tiles',
            'source-layer': sourceLayer,
            paint: { 'line-color': '#999999', 'line-width': 1, 'line-opacity': 0.6 },
            filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
          },
          {
            id: 'nyc-roads',
            type: 'line' as const,
            source: 'nyc-tiles',
            'source-layer': sourceLayer,
            paint: {
              'line-color': '#666666',
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
              'line-opacity': 1.0
            },
            filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
          }
        ];

        layersToAdd.forEach(layer => {
          if (!mapInstance!.getLayer(layer.id)) {
            mapInstance!.addLayer(layer);
          }
        });
      } catch (error) {
        console.error('Error adding static layers:', error);
      }
    });

    mapInstance.on('moveend', handleViewportChange);

    mapInstance.on('error', e => {
      console.error('🚨 Map error:', e.error);
    });

    setMap(mapInstance);
  }, [map, onMapLoaded, handleViewportChange]);

  return <div ref={mapRef} className="w-full h-full" />;
};

export default MapLibreMap;
