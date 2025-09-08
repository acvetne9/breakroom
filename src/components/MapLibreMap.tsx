import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportMapData } from '../hooks/useViewportMapData';
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
  const [currentZoom, setCurrentZoom] = useState(12);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);
  const isMovingRef = useRef(false);
  const processedRef = useRef(false);

  const { isProcessing, setIsProcessing } = useViewportMapData();
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    isSearching
  } = useViewportBusinesses(searchFilters);

  // Enhanced business click handler with viewport integration
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('🎯 MapLibreMap handleBusinessClick called:', business.name);
    
    // Zoom to business first
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

  // Viewport change handler
  const handleViewportChange = useCallback((isInitial: boolean = false) => {
    if (!map || !mapLoaded) return;

    console.log('🗺️ handleViewportChange called with searchFilters:', searchFilters);

    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      
      const viewportBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      };

      const businessLimit = isMobile ? 12000 : 25000;
      console.log('🗺️ About to call loadBusinessesInViewport with searchFilters:', searchFilters);
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      
      setCurrentZoom(zoom);
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, searchFilters, loadBusinessesInViewport]);

  // Safe layer addition with error handling
  const addMapLayers = useCallback((mapInstance: maplibregl.Map) => {
    if (layersAddedRef.current) return;
    
    console.log('🔄 NYC tiles loaded, adding layers...');
    const sourceLayer = 'examplepoints';
    
    try {
      // Add base layers in proper order (bottom to top)
      mapInstance.addLayer({
        id: 'nyc-land',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'fill-color': '#F5F5DC',
          'fill-opacity': 1.0
        },
        filter: ['==', ['geometry-type'], 'Polygon']
      });
      
      mapInstance.addLayer({
        id: 'nyc-green-spaces',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'fill-color': '#87C17A',
          'fill-opacity': 1.0
        },
        filter: [
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['any',
            ['==', ['get', 'leisure'], 'park'],
            ['==', ['get', 'landuse'], 'cemetery']
          ]
        ]
      });
      
      mapInstance.addLayer({
        id: 'nyc-water',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'fill-color': '#6CA4E1',
          'fill-opacity': 1.0
        },
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
      });
      
      mapInstance.addLayer({
        id: 'nyc-waterways',
        type: 'line',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'line-color': '#999999',
          'line-width': 1,
          'line-opacity': 0.6
        },
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'waterway']]
      });
      
      // Roads layer
      mapInstance.addLayer({
        id: 'nyc-roads',
        type: 'line',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'line-color': '#666666',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 16, 3],
          'line-opacity': 1.0
        },
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
      });
      
      // Business points
      mapInstance.addLayer({
        id: 'nyc-businesses',
        type: 'circle',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'circle-color': '#FACC15',
          'circle-radius': 8,
          'circle-opacity': 1.0,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF'
        },
        filter: ['==', ['geometry-type'], 'Point']
      });
      
      // Road labels - IMPORTANT: Add after roads so they appear on top
      mapInstance.addLayer({
        id: 'nyc-road-labels',
        type: 'symbol',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ''],
          'symbol-placement': 'line',
          'text-size': 12,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
        },
        paint: {
          'text-color': '#2D3748',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5
        },
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'name'], ['has', 'highway']]
      });
      
      // Add click handler for businesses
      mapInstance.on('click', 'nyc-businesses', e => {
        const feature = e.features?.[0];
        if (feature) {
          const business = {
            id: feature.properties?.id || Math.random().toString(36).substr(2, 9),
            name: feature.properties?.name || 'Unknown Business',
            position: {
              lat: e.lngLat.lat,
              lng: e.lngLat.lng
            },
            businessType: feature.properties?.amenity || feature.properties?.shop || 'business',
            address: feature.properties?.addr_full || feature.properties?.address,
            atmosphere: []
          };
          
          if (onBusinessClick) {
            onBusinessClick(business);
          }
        }
      });
      
      // Add cursor pointer on hover
      mapInstance.on('mouseenter', 'nyc-businesses', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      
      mapInstance.on('mouseleave', 'nyc-businesses', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
      
      layersAddedRef.current = true;
      console.log('✅ All NYC layers added successfully!');
      
    } catch (error) {
      console.error('❌ Error adding layers:', error);
    }
  }, [onBusinessClick]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    console.log('🧭 Using tiles URL:', absoluteTilesUrl);

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
      if (cleanedUp) return;
      console.log('🗺️ Map loaded');
      setMapLoaded(true);
      if (onMapLoaded) {
        onMapLoaded();
      }
    });

    // Movement tracking
    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
    });

    mapInstance.on('error', e => {
      console.error('🚨 Map error:', e.error);
    });
    
    // Add layers when source is loaded
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        addMapLayers(mapInstance);
      }
    });

    setMap(mapInstance);

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        } finally {
          layersAddedRef.current = false;
        }
      }
      setMap(null);
      setMapLoaded(false);
    };
  }, [onMapLoaded, addMapLayers]);

  // Process map features after initialization
  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processedRef.current = true;
      console.log('🎉 NYC .pbf vector tiles ready');
    }
  }, [mapLoaded, map]);

  // Reload businesses when search filters change
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (searchFilters === undefined) return;
    
    console.log('🗺️ Map reloading businesses due to filter change:', searchFilters);
    
    // Stop processing if filters are null (explicitly cleared)
    if (searchFilters === null) {
      console.log('🧹 Search filters cleared - loading normal businesses');
      try {
        const mapBounds = map.getBounds();
        const viewportBounds = {
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east: mapBounds.getEast(),
          west: mapBounds.getWest()
        };
        const businessLimit = isMobile ? 12000 : 25000;
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      } catch (e) {
        console.warn('⚠️ Failed to reload normal businesses:', e);
      }
      return;
    }
    
    try {
      const mapBounds = map.getBounds();
      if (searchFilters && Object.keys(searchFilters).length > 0) {
        const viewportBounds = {
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east: mapBounds.getEast(),
          west: mapBounds.getWest()
        };
        const businessLimit = isMobile ? 12000 : 25000;
        console.log('🔍 Viewport-only search: using current map bounds');
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      }
    } catch (e) {
      console.warn('⚠️ Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Zoom to selected business
  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 800
    });
  }, [selectedBusiness?.id, map, mapLoaded]);

  // Center map on neighborhood
  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;
    
    console.log('🏙️ Centering map on neighborhood:', neighborhoodCenter);
    map.easeTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 1000
    });
  }, [neighborhoodCenter, map, mapLoaded]);

  // Business loading with debouncing
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout | null = null;
    
    const moveEndHandler = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      
      console.log('🗺️ Map moveend - current search filters:', searchFilters);
      
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    map.on('moveend', moveEndHandler);
    
    // Initial load
    handleViewportChange(true);
    
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Handle vector tile business visibility during search
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const hasSearchFilters = searchFilters && Object.keys(searchFilters).length > 0;
    const shouldHideVector = hasSearchFilters || businesses.length > 0;
    
    if (map.getLayer('nyc-businesses')) {
      const visibility = shouldHideVector ? 'none' : 'visible';
      console.log(`🎯 Setting vector tile businesses visibility to: ${visibility}`);
      map.setLayoutProperty('nyc-businesses', 'visibility', visibility);
    }
  }, [searchFilters, businesses.length, map, mapLoaded]);

  // Notify parent when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses.length, onBusinessesLoaded]);

  // Emoji landmarks with zoom-responsive sizing
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;

    console.log('Adding emoji landmarks:', landmarks);

    // Remove previous markers
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    try {
      const updateEmojiSize = () => {
        const zoom = map.getZoom();
        const baseSize = 16;
        const scaleFactor = Math.pow(1.2, zoom - 10);
        const size = Math.max(12, Math.min(32, baseSize * scaleFactor));
        
        landmarkMarkersRef.current.forEach(marker => {
          const element = marker.getElement();
          if (element) {
            element.style.fontSize = `${size}px`;
            element.style.lineHeight = `${size}px`;
            element.style.width = `${size}px`;
            element.style.height = `${size}px`;
          }
        });
      };

      const newMarkers: maplibregl.Marker[] = landmarks.map((landmark, index) => {
        console.log(`Creating marker ${index}:`, landmark);
        
        const zoom = map.getZoom();
        const baseSize = 16;
        const scaleFactor = Math.pow(1.2, zoom - 10);
        const size = Math.max(12, Math.min(32, baseSize * scaleFactor));
        
        const el = document.createElement('div');
        el.textContent = landmark.emoji;
        Object.assign(el.style, {
          fontSize: `${size}px`,
          lineHeight: `${size}px`,
          width: `${size}px`,
          height: `${size}px`,
          userSelect: 'none',
          pointerEvents: 'none',
          textShadow: '0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)',
          zIndex: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        } as CSSStyleDeclaration);

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
        
        return marker;
      });

      landmarkMarkersRef.current = newMarkers;
      
      // Add zoom listener for responsive sizing
      map.on('zoom', updateEmojiSize);
      
      console.log(`Successfully added ${newMarkers.length} emoji markers`);

      // Cleanup function
      return () => {
        landmarkMarkersRef.current.forEach(m => m.remove());
        landmarkMarkersRef.current = [];
        map.off('zoom', updateEmojiSize);
      };
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
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
        zIndex: 1,
        backgroundColor: '#B3E5FC'
      }}
    >
      {/* Deck.GL Overlay for high-performance business rendering */}
      {map && mapLoaded && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
          zoom={currentZoom}
        />
      )}
    </div>
  );
};

export default MapLibreMap;