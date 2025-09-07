import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { DeckGLOverlay } from './DeckGLOverlay';

interface MapLibreMapProps {
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
  landmarks?: { lat: number; lng: number; emoji: string }[];
  onMapLoaded?: () => void;
  onBusinessesLoaded?: () => void;
  searchFilters?: any;
  neighborhoodCenter?: { lat: number; lon: number } | null;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = [],
  onMapLoaded,
  onBusinessesLoaded,
  searchFilters,
  neighborhoodCenter
}) => {
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails
  } = useViewportBusinesses(searchFilters);

  // Enhanced business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('Business clicked:', business.name);
    
    // Zoom to business
    if (map) {
      map.easeTo({
        center: [business.position.lng, business.position.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: 800
      });
    }
    
    // Fetch full details if needed
    if (!business.atmosphere?.length && !business.roles?.length) {
      const fullBusiness = await fetchFullBusinessDetails(business.id);
      if (fullBusiness && onBusinessClick) {
        onBusinessClick(fullBusiness);
      }
    } else if (onBusinessClick) {
      onBusinessClick(business);
    }
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

  // Load businesses in current viewport
  const loadBusinesses = useCallback(() => {
    if (!map || !mapLoaded) return;

    const bounds = map.getBounds();
    const viewportBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };

    const businessLimit = isMobile ? 12000 : 25000;
    loadBusinessesInViewport(viewportBounds, businessLimit, false);
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const tilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    
    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'nyc-tiles': {
            type: 'vector',
            tiles: [tilesUrl],
            minzoom: 10,
            maxzoom: 16
          }
        },
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#F5F5DC' }
          }
        ]
      },
      center: [-73.986104, 40.715245],
      zoom: 12.77,
      maxZoom: 18,
      minZoom: 9,
      maxBounds: [[-74.25909, 40.494399], [-73.700272, 40.917]]
    });

    mapInstance.on('load', () => {
      setMapLoaded(true);
      if (onMapLoaded) onMapLoaded();
    });

    // Add layers when source is loaded
    mapInstance.on('sourcedata', (e) => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded) {
        addMapLayers(mapInstance);
      }
    });

    // Handle map movement
    let moveTimeout: NodeJS.Timeout;
    mapInstance.on('moveend', () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(loadBusinesses, 300);
    });

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
      setMap(null);
      setMapLoaded(false);
    };
  }, [loadBusinesses, onMapLoaded]);

  // Add map layers
  const addMapLayers = (mapInstance: maplibregl.Map) => {
    const sourceLayer = 'examplepoints';
    
    try {
      // Land
      mapInstance.addLayer({
        id: 'nyc-land',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
        filter: ['==', ['geometry-type'], 'Polygon']
      });

      // Parks
      mapInstance.addLayer({
        id: 'nyc-parks',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: { 'fill-color': '#87C17A', 'fill-opacity': 1.0 },
        filter: [
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['any', ['==', ['get', 'leisure'], 'park'], ['==', ['get', 'landuse'], 'cemetery']]
        ]
      });

      // Water
      mapInstance.addLayer({
        id: 'nyc-water',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
      });

      // Roads
      mapInstance.addLayer({
        id: 'nyc-roads',
        type: 'line',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'line-color': '#666666',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3]
        },
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
      });

      // Vector tile businesses
      mapInstance.addLayer({
        id: 'nyc-businesses',
        type: 'circle',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'circle-color': '#FACC15',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF'
        },
        filter: ['==', ['geometry-type'], 'Point']
      });

      // Business click handler
      mapInstance.on('click', 'nyc-businesses', (e) => {
        const feature = e.features?.[0];
        if (feature && onBusinessClick) {
          const business = {
            id: feature.properties?.id || Math.random().toString(36).substr(2, 9),
            name: feature.properties?.name || 'Unknown Business',
            position: { lat: e.lngLat.lat, lng: e.lngLat.lng },
            businessType: feature.properties?.amenity || feature.properties?.shop || 'business'
          };
          onBusinessClick(business);
        }
      });

      // Cursor styling
      mapInstance.on('mouseenter', 'nyc-businesses', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'nyc-businesses', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

    } catch (error) {
      console.error('Error adding layers:', error);
    }
  };

  // Load businesses when search filters change
  useEffect(() => {
    if (searchFilters !== undefined) {
      loadBusinesses();
    }
  }, [searchFilters, loadBusinesses]);

  // Center on selected business
  useEffect(() => {
    if (!map || !selectedBusiness?.position) return;
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 800
    });
  }, [selectedBusiness?.id, map]);

  // Center on neighborhood
  useEffect(() => {
    if (!map || !neighborhoodCenter) return;
    map.easeTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 1000
    });
  }, [neighborhoodCenter, map]);

  // Handle vector tile business visibility
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const hasSearchFilters = searchFilters && Object.keys(searchFilters).length > 0;
    const shouldHideVectorBusinesses = hasSearchFilters || businesses.length > 0;
    
    if (map.getLayer('nyc-businesses')) {
      map.setLayoutProperty('nyc-businesses', 'visibility', 
        shouldHideVectorBusinesses ? 'none' : 'visible');
    }
  }, [searchFilters, businesses.length, map, mapLoaded]);

  // Notify when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses.length, onBusinessesLoaded]);

  // Handle landmarks
  useEffect(() => {
    if (!mapLoaded || !map) return;

    // Clear existing markers
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    const newMarkers = landmarks.map(landmark => {
      const el = document.createElement('div');
      el.textContent = landmark.emoji;
      el.style.fontSize = '20px';
      el.style.textShadow = '0 0 3px rgba(255,255,255,0.9)';
      el.style.userSelect = 'none';
      el.style.pointerEvents = 'none';

      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([landmark.lng, landmark.lat])
        .addTo(map);
    });

    landmarkMarkersRef.current = newMarkers;
  }, [mapLoaded, landmarks, map]);

  return (
    <div
      ref={mapRef}
      style={{ 
        position: 'absolute', 
        top: 0, 
        bottom: 0, 
        left: 0, 
        right: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#B3E5FC'
      }}
    >
      {map && mapLoaded && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
          zoom={map.getZoom()}
        />
      )}
    </div>
  );
};

export default MapLibreMap;