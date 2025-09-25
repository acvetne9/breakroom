import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer } from '@/utils/deckGLLayers';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
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

// Convert GeoJSON Point Feature -> { lat, lon }
const featureToLatLon = (feature: Feature<Point> | { lat: number; lon: number }) => {
  if ('geometry' in feature && feature.geometry?.type === 'Point') {
    return { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] };
  }
  if ('lat' in feature && 'lon' in feature) return feature;
  throw new Error('Invalid feature for conversion to lat/lon');
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
  isClusteredData = false
}) => {
  // State and refs
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lastBoundsRef = useRef<string>('');
  const lastLoadTimeRef = useRef(0);

  const callbackRefs = useRef({ onBusinessClick, onMapLoaded, onBusinessesLoaded });
  useEffect(() => { 
    callbackRefs.current = { onBusinessClick, onMapLoaded, onBusinessesLoaded }; 
  }, [onBusinessClick, onMapLoaded, onBusinessesLoaded]);

  // Use the viewport businesses hook
  const { businesses, loading, loadBusinessesInViewport, fetchFullBusinessDetails, isSearching } = useViewportBusinesses(searchFilters);

  // Trigger callback when businesses are loaded
  useEffect(() => {
    if (businesses && businesses.length > 0) {
      console.log(`🔄 Refreshing Deck overlay with ${businesses.length} businesses`);
      callbackRefs.current.onBusinessesLoaded?.();
    }
  }, [businesses]);

  // Get business limit based on zoom level
  const getBusinessLimitForViewport = useCallback((zoom: number) => {
    if (zoom < 10) return 1000;
    if (zoom < 12) return 2000;
    if (zoom < 14) return 5000;
    if (zoom < 16) return 10000;
    return 20000;
  }, []);

  // Handle business click with fly-to behavior
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

  // Handle viewport changes (scroll/zoom)
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

    // Prevent duplicate calls for same viewport within 300ms
    const now = Date.now();
    if (lastBoundsRef.current === boundsKey && now - lastLoadTimeRef.current < 300) {
      return;
    }

    lastBoundsRef.current = boundsKey;
    lastLoadTimeRef.current = now;

    try {
      console.log(`🗺️ Loading businesses for viewport: ${boundsKey}`);
      const limit = getBusinessLimitForViewport(zoom);
      await loadBusinessesInViewport?.(viewportBounds, limit, true);
    } catch (err) {
      console.error("❌ Error loading businesses:", err);
    }
  }, [mapLoaded, loadBusinessesInViewport, getBusinessLimitForViewport]);

  // Initialize map
  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      console.log('🗺️ Initializing MapLibre GL map...');
      
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'osm-tiles',
              type: 'raster',
              source: 'osm-tiles'
            }
          ]
        },
        center: [-74.006, 40.7128], // NYC center
        zoom: 12,
        attributionControl: true
      });

      mapRef.current = map;

      // Map load event
      map.on('load', () => {
        console.log('🗺️ Map loaded successfully');
        setMapLoaded(true);
        callbackRefs.current.onMapLoaded?.();

        // Load initial businesses
        const bounds = map.getBounds();
        const viewportBounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        };
        loadBusinessesInViewport?.(viewportBounds, 2000);
      });

      // Add viewport change listeners with debouncing
      let moveTimeout: NodeJS.Timeout;
      const debouncedViewportChange = () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(handleViewportChange, 300);
      };

      map.on('moveend', debouncedViewportChange);
      map.on('zoomend', debouncedViewportChange);

      // Error handling
      map.on('error', (e) => {
        console.log('🗺️ Map error:', e.error);
        // Don't let errors block the app - just log them
        setMapLoaded(true);
      });

    } catch (err) {
      console.error('❌ Map initialization failed:', err);
    }
  }, [handleViewportChange, loadBusinessesInViewport]);

  // Initialize Deck.GL overlay
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || deckOverlay) return;

    try {
      console.log('🎯 Initializing Deck.GL overlay...');
      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      });
      
      mapRef.current.addControl(overlay);
      setDeckOverlay(overlay);
      console.log('✅ Deck.GL overlay initialized');
    } catch (err) {
      console.error('❌ Failed to initialize Deck.GL overlay:', err);
    }
  }, [mapLoaded, deckOverlay]);

  // Create Deck.GL layers
  const deckGLLayers = useMemo(() => {
    if (!businesses || !businesses.length) {
      console.log('🔄 Refreshing Deck overlay with 0 businesses');
      return [];
    }

    // Filter valid businesses
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
        console.log(`🎯 Creating scatterplot layer with ${validBusinesses.length} businesses inside polygon`);
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

  // Update Deck.GL layers
  useEffect(() => {
    if (deckOverlay && deckGLLayers) {
      try {
        deckOverlay.setProps({ layers: deckGLLayers });
        console.log(`🔄 Refreshing Deck overlay with ${businesses?.length || 0} businesses`);
      } catch (err) {
        console.error('❌ Failed to update Deck.GL layers:', err);
      }
    }
  }, [deckOverlay, deckGLLayers, businesses?.length]);

  // Handle landmarks
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // Clear existing markers
    landmarkMarkersRef.current.forEach(marker => marker.remove());
    landmarkMarkersRef.current = [];

    // Add new markers
    landmarks.forEach(landmark => {
      if (landmark.lat && landmark.lng) {
        const el = document.createElement('div');
        el.className = 'landmark-marker';
        el.innerHTML = landmark.emoji;
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';

        const marker = new maplibregl.Marker(el)
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(mapRef.current!);
        
        landmarkMarkersRef.current.push(marker);
      }
    });
  }, [landmarks, mapLoaded]);

  // Fly to neighborhood center
  useEffect(() => {
    if (mapRef.current && neighborhoodCenter && mapLoaded) {
      mapRef.current.flyTo({
        center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
        zoom: 14,
        duration: 1000
      });
    }
  }, [neighborhoodCenter, mapLoaded]);

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      landmarkMarkersRef.current.forEach(marker => marker.remove());
      landmarkMarkersRef.current = [];
    };
  }, [initializeMap]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-2 rounded-lg text-sm">
          {isSearching ? 'Searching...' : 'Loading businesses...'}
        </div>
      )}
    </div>
  );
};

export default MapLibreMap;