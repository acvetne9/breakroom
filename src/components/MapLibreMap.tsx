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
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  onBusinessClick,
  selectedBusiness,
  landmarks = [],
  onMapLoaded,
  onBusinessesLoaded
}) => {
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const { isProcessing, setIsProcessing } = useViewportMapData();
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails
  } = useViewportBusinesses();
  const [currentZoom, setCurrentZoom] = useState(12);
  const layersAddedRef = useRef(false);
  const timerRefs = useRef<NodeJS.Timeout[]>([]);

  // Enhanced business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    try {
      console.log('Business clicked:', business.name);
      
      if (map) {
        map.easeTo({
          center: [business.position.lng, business.position.lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 800
        });
      }
      
      if (!business.atmosphere?.length && !business.roles?.length) {
        const fullBusiness = await fetchFullBusinessDetails(business.id);
        if (fullBusiness && onBusinessClick) {
          onBusinessClick(fullBusiness);
        }
      } else if (onBusinessClick) {
        onBusinessClick(business);
      }
    } catch (error) {
      console.error('Error in handleBusinessClick:', error);
    }
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

  // Fixed viewport change handler
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

      const businessLimit = isMobile ? 12000 : 25000;
      loadBusinessesInViewport(viewportBounds, businessLimit, false);
      setCurrentZoom(zoom);
      
    } catch (error) {
      console.error('Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Simplified layer addition function
  const addMapLayers = useCallback((sourceLayer: string) => {
    if (!map || layersAddedRef.current) return;

    try {
      // Add layers in correct order
      const layersToAdd = [
        {
          id: 'nyc-land',
          type: 'fill' as const,
          paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1.0 },
          filter: ['==', ['geometry-type'], 'Polygon']
        },
        {
          id: 'nyc-parks',
          type: 'fill' as const,
          paint: { 'fill-color': '#87C17A', 'fill-opacity': 1.0 },
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'leisure']]
        },
        {
          id: 'nyc-water',
          type: 'fill' as const,
          paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1.0 },
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'natural']]
        },
        {
          id: 'nyc-roads',
          type: 'line' as const,
          paint: {
            'line-color': '#666666',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 3, 18, 8],
            'line-opacity': 0.9
          },
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
        }
      ];

      layersToAdd.forEach(layer => {
        try {
          map.addLayer({
            ...layer,
            source: 'nyc-tiles',
            'source-layer': sourceLayer
          });
        } catch (layerError) {
          console.warn(`Failed to add layer ${layer.id}:`, layerError);
        }
      });

      layersAddedRef.current = true;
      console.log('Map layers added successfully');
    } catch (error) {
      console.error('Error adding map layers:', error);
    }
  }, [map]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

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
      layers: [{
        id: 'background',
        type: 'background' as const,
        paint: { 'background-color': '#F5F5DC' }
      }]
    };

    try {
      mapInstance = new maplibregl.Map({
        container: mapRef.current,
        style: baseStyle,
        center: [-73.986104, 40.715245],
        zoom: 12.77,
        maxZoom: 18,
        minZoom: 8,
        renderWorldCopies: false,
        attributionControl: false
      });
      
      mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);
      
    } catch (error) {
      console.error('Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      setMapLoaded(true);
      onMapLoaded?.();
    });

    // Simplified sourcedata handler
    mapInstance.on('sourcedata', (e) => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        // Single timeout to add layers after source is loaded
        const timeout = setTimeout(() => {
          try {
            const features = mapInstance!.querySourceFeatures('nyc-tiles');
            const sourceLayers = Array.from(new Set(features.map((f: any) => f.sourceLayer)));
            
            if (sourceLayers.length > 0) {
              addMapLayers(sourceLayers[0]);
            } else {
              // Fallback to known layer name
              addMapLayers('examplepoints');
            }
          } catch (error) {
            console.error('Error querying source features:', error);
          }
        }, 100);
        
        timerRefs.current.push(timeout);
      }
    });

    mapInstance.on('error', (e) => {
      console.error('Map error:', e.error);
    });

    setMap(mapInstance);

    return () => {
      cleanedUp = true;
      // Clear all timers
      timerRefs.current.forEach(timer => clearTimeout(timer));
      timerRefs.current = [];
      
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        }
      }
      setMap(null);
      setMapLoaded(false);
      layersAddedRef.current = false;
    };
  }, []); // Empty dependency array to prevent re-initialization

  // Business loading effect
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout | null = null;

    const moveEndHandler = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        handleViewportChange();
      }, 300);
    };

    map.on('moveend', moveEndHandler);
    
    // Initial load
    handleViewportChange();

    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Landmarks effect
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;

    // Clean up previous markers
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    try {
      const newMarkers = landmarks.map((landmark) => {
        const el = document.createElement('div');
        el.textContent = landmark.emoji;
        Object.assign(el.style, {
          fontSize: '16px',
          lineHeight: '16px',
          width: '16px',
          height: '16px',
          userSelect: 'none',
          pointerEvents: 'none',
          textShadow: '0 0 3px rgba(255,255,255,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        });

        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
      });

      landmarkMarkersRef.current = newMarkers;
    } catch (error) {
      console.error('Error adding landmarks:', error);
    }

    return () => {
      landmarkMarkersRef.current.forEach(m => m.remove());
      landmarkMarkersRef.current = [];
    };
  }, [mapLoaded, landmarks, map]);

  // Notify when businesses are loaded
  useEffect(() => {
    if (!businessesLoading && businesses.length > 0) {
      onBusinessesLoaded?.();
    }
  }, [businessesLoading, businesses.length, onBusinessesLoaded]);

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
      {/* Status indicator */}
      <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs p-2 rounded z-50 pointer-events-none">
        <div>Businesses: {businesses.length}</div>
        <div>Loading: {businessesLoading ? 'Yes' : 'No'}</div>
        <div>Vector Tiles: Ready</div>
      </div>
      
      {/* Deck.GL Overlay */}
      {map && mapLoaded && businesses.length > 0 && (
        <DeckGLOverlay
          map={map}
          businesses={businesses}
          selectedBusinessId={selectedBusiness?.id}
          onBusinessClick={handleBusinessClick}
          zoom={currentZoom}
        />
      )}
      
      {/* No businesses message */}
      {map && mapLoaded && businesses.length === 0 && !businessesLoading && (
        <div className="absolute bottom-4 left-4 bg-yellow-500 bg-opacity-90 text-black text-sm p-3 rounded max-w-xs">
          <div className="font-semibold">No businesses in this area</div>
          <div className="text-xs">Try moving the map or zooming out</div>
        </div>
      )}
    </div>
  );
};

export default MapLibreMap;