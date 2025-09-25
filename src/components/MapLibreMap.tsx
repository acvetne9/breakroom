import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lastBoundsRef = useRef<string>('');
  const lastLoadTimeRef = useRef(0);

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { 
    callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; 
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // Business loading hook
  const { businesses, loading, loadBusinessesInViewport, fetchFullBusinessDetails, isSearching } = useViewportBusinesses(searchFilters);

  // Trigger callback when businesses are loaded
  useEffect(() => {
    if (businesses && businesses.length > 0) {
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  // Calculate business limit based on zoom level
  const getBusinessLimitForViewport = useCallback((zoom: number) => {
    if (zoom >= 15) return 3000;
    if (zoom >= 13) return 2000;
    if (zoom >= 11) return 1500;
    return 1000;
  }, []);

  // Handle business click
  const handleBusinessClick = useCallback((business: any) => {
    callbackRefs.current.onBusinessClick?.(business);
  }, []);

  // Convert GeoJSON feature to lat/lon
  const featureToLatLon = (feature: any) => {
    if (feature.lat !== undefined && feature.lon !== undefined) {
      return { lat: feature.lat, lon: feature.lon };
    }
    if (Array.isArray(feature) && feature.length >= 2) {
      return { lat: feature[1], lon: feature[0] };
    }
    return { lat: 0, lon: 0 };
  };

  // Simplified viewport change handler
  const handleViewportChange = useCallback(async () => {
    if (!mapRef.current || !mapLoaded) return;
  
    const map = mapRef.current;
    const bounds = map.getBounds();
    const viewportBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };
  
    const boundsKey = `${viewportBounds.north.toFixed(3)}-${viewportBounds.south.toFixed(3)}-${viewportBounds.east.toFixed(3)}-${viewportBounds.west.toFixed(3)}`;
  
    // Simple debouncing - prevent same viewport within 500ms
    const now = Date.now();
    if (lastBoundsRef.current === boundsKey && now - lastLoadTimeRef.current < 500) {
      return;
    }
  
    lastBoundsRef.current = boundsKey;
    lastLoadTimeRef.current = now;
  
    console.log(`🗺️ Loading businesses for new viewport: ${boundsKey}`);
    const limit = Math.min(2000, getBusinessLimitForViewport(map.getZoom()));
    await loadBusinessesInViewport?.(viewportBounds, limit, true);
  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport]);

  // Create Deck.GL layers
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
  
    try {
      const layer = createBusinessScatterplotLayer({
        businesses: validBusinesses,
        selectedBusinessId: selectedBusiness?.id,
        onBusinessClick: handleBusinessClick,
        neighborhoodBoundary: searchFilters?.neighborhoodFilter?.boundary || null
      });
      console.log("✅ Created scatterplot layer:", layer);
      return [layer];
    } catch (err) {
      console.error("❌ Failed to create scatterplot layer", err);
      return [];
    }
  }, [selectedBusiness?.id, handleBusinessClick, mapLoaded, searchFilters, businesses]);

  // Handle fly to business events
  const handleFlyToBusiness = useCallback((event: CustomEvent) => {
    if (!mapRef.current) return;
    
    const { lat, lng, business } = event.detail;
    console.log('🛩️ Flying to business:', business.name, 'at', lat, lng);
    
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 16,
      duration: 2000,
      essential: true
    });
  }, []);

  // Initialize map
  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;
      
      console.log('🗺️ Initializing MapLibre GL map');

      // Create map with simple OSM tiles
      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster' as const,
              tiles: [
                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
              ],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'osm-tiles',  
              type: 'raster' as const,
              source: 'osm',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        },
        center: [-73.985, 40.758], // NYC center
        zoom: 11,
        minZoom: 8,
        maxZoom: 18,
        attributionControl: false,
        logoPosition: 'bottom-right' as const
      });

      mapRef.current = mapInstance;

      // Add fly to business event listener
      window.addEventListener('flyToBusiness', handleFlyToBusiness as EventListener);

      // Handle map load
      mapInstance.on('load', () => {
        console.log('🗺️ Map loaded successfully');
        setMapLoaded(true);
        callbackRefs.current.onMapLoaded?.();
        
        // Load initial businesses after a short delay
        setTimeout(() => {
          if (mapRef.current && !loading) {
            handleViewportChange();
          }
        }, 1000);
      });

      // Handle map errors gracefully
      mapInstance.on('error', (e) => {
        console.log('🗺️ Map error:', e.error);
        if (!mapLoaded) {
          console.log('🗺️ Setting map as loaded despite error');
          setMapLoaded(true);
          callbackRefs.current.onMapLoaded?.();
        }
      });

      // Add viewport change listeners with debouncing
      let debounceTimeout: NodeJS.Timeout;
      const handleMove = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          handleViewportChange();
        }, 300);
      };
      
      mapInstance.on('moveend', handleMove);
      mapInstance.on('zoomend', handleMove);

      // Initialize Deck.GL overlay
      try {
        const overlay = new MapboxOverlay({
          interleaved: true,
          layers: []
        });
        mapInstance.addControl(overlay as any);
        setDeckOverlay(overlay);
        
        setTimeout(() => setOverlayReady(true), 100);
      } catch (overlayError) {
        console.error('❌ Failed to initialize Deck.GL overlay:', overlayError);
      }

      // Cleanup function
      return () => {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        window.removeEventListener('flyToBusiness', handleFlyToBusiness as EventListener);
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    };

    initializeMap();
  }, [handleFlyToBusiness, handleViewportChange, loading]);

  // Update deck layers when businesses change
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

  // Handle neighborhood center changes
  useEffect(() => {
    if (!mapRef.current || !neighborhoodCenter) return;
    
    const map = mapRef.current;
    console.log('🎯 Flying to neighborhood center:', neighborhoodCenter);
    
    map.flyTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 13,
      duration: 2000,
      essential: true
    });
  }, [neighborhoodCenter]);

  // Handle selected business changes
  useEffect(() => {
    if (!mapRef.current || !selectedBusiness?.position) return;
    
    const map = mapRef.current;
    const { lat, lng } = selectedBusiness.position;
    
    if (lat && lng) {
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 1500,
        essential: true
      });
    }
  }, [selectedBusiness]);

  return (
    <div 
      ref={mapContainerRef}
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