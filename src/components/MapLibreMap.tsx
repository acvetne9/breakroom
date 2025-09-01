import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { DeckGLOverlay } from './DeckGLOverlay';
import { 
  extractParkFeatures, 
  extractWaterFeatures, 
  extractRoadFeatures, 
  extractWaterwayFeatures 
} from '../utils/featureProcessing';
import {
  addLandLayer,
  addParksLayer,
  addWaterLayer,
  addWaterwaysLayer,
  addRoadsLayer,
  addRoadsLayerChunked,
  ensureLayerOrder
} from '../utils/mapLayers';

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
  const isMovingRef = useRef(false);

  // Enhanced business click handler
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('🎯 MapLibreMap handleBusinessClick called:', business.name);
    
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
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

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

      const businessLimit = isMobile ? 12000 : 25000;
      loadBusinessesInViewport(viewportBounds, businessLimit, isMovingRef.current);
      setCurrentZoom(zoom);
      
    } catch (error) {
      console.error('❌ Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, loadBusinessesInViewport]);

  // Add map layers function
  const addMapLayers = useCallback((sourceLayer: string) => {
    if (!map || layersAddedRef.current) return;

    try {
      // Background land
      map.addLayer({
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

      // Parks
      map.addLayer({
        id: 'nyc-parks',
        type: 'fill',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'fill-color': '#87C17A',
          'fill-opacity': 1.0
        },
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'leisure']]
      });

      // Water
      map.addLayer({
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

      // Roads
      map.addLayer({
        id: 'nyc-roads',
        type: 'line',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        paint: {
          'line-color': '#666666',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 1,
            14, 3,
            18, 8
          ],
          'line-opacity': 0.9
        },
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'highway']]
      });

      // Road labels - FIXED VERSION
      map.addLayer({
        id: 'nyc-roads-labels',
        type: 'symbol',
        source: 'nyc-tiles',
        'source-layer': sourceLayer,
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'ref'], ''],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            12, 10,
            15, 12,
            18, 16
          ],
          'symbol-placement': 'line',
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport',
          'text-anchor': 'center',
          'text-max-angle': 30,
          'text-keep-upright': true,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'symbol-spacing': 250,
          'text-padding': 2
        },
        paint: {
          'text-color': '#333333',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            11, 0,
            12, 0.8,
            15, 1.0
          ]
        },
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['has', 'highway'],
          ['!=', ['coalesce', ['get', 'name'], ['get', 'ref'], ''], '']
        ],
        minzoom: 12
      });

      // Waterways
      map.addLayer({
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

      // Businesses points
      map.addLayer({
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

      layersAddedRef.current = true;
      console.log('✅ All layers added successfully');
      
    } catch (error) {
      console.error('❌ Error adding layers:', error);
    }
  }, [map]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const absoluteTilesUrl = `${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
    
    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'nyc-tiles': {
            type: 'vector',
            tiles: [absoluteTilesUrl],
            minzoom: 10,
            maxzoom: 16,
            scheme: 'xyz'
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
      minZoom: 8,
      renderWorldCopies: false,
      attributionControl: false
    });
    
    mapInstance.setMaxBounds([[-74.25909, 40.494399], [-73.700272, 40.917]]);

    mapInstance.on('load', () => {
      setMapLoaded(true);
      if (onMapLoaded) onMapLoaded();
    });

    mapInstance.on('movestart', () => {
      isMovingRef.current = true;
    });

    // Simplified layer addition - try adding layers when tiles load
    mapInstance.on('sourcedata', (e) => {
      if (e.sourceId === 'nyc-tiles' && e.isSourceLoaded && !layersAddedRef.current) {
        // Try with known source layer first
        setTimeout(() => {
          try {
            addMapLayers('examplepoints');
          } catch (error) {
            console.warn('Failed with examplepoints, trying auto-detection');
            // Fallback: auto-detect source layer
            try {
              const features = mapInstance.querySourceFeatures('nyc-tiles');
              const sourceLayers = [...new Set(features.map((f: any) => f.sourceLayer))];
              if (sourceLayers.length > 0) {
                addMapLayers(sourceLayers[0]);
              }
            } catch (err) {
              console.error('Failed to add layers:', err);
            }
          }
        }, 100);
      }
    });

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
      setMap(null);
      setMapLoaded(false);
      layersAddedRef.current = false;
    };
  }, [addMapLayers, onMapLoaded]);

  // Handle viewport changes
  useEffect(() => {
    if (!map || !mapLoaded) return;

    let moveTimeout: NodeJS.Timeout;
    
    const moveEndHandler = () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    
    map.on('moveend', moveEndHandler);
    handleViewportChange(); // Initial load
    
    return () => {
      map.off('moveend', moveEndHandler);
      clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  // Handle landmarks
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;

    // Clear existing markers
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];

    if (landmarks.length === 0) return;

    const newMarkers = landmarks.map((landmark) => {
      const el = document.createElement('div');
      el.textContent = landmark.emoji;
      el.style.cssText = `
        font-size: 20px;
        user-select: none;
        pointer-events: none;
        text-shadow: 0 0 3px rgba(255,255,255,0.9);
      `;

      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([landmark.lng, landmark.lat])
        .addTo(map);
    });

    landmarkMarkersRef.current = newMarkers;

    return () => {
      newMarkers.forEach(m => m.remove());
      landmarkMarkersRef.current = [];
    };
  }, [mapLoaded, landmarks, map]);

  // Notify when businesses loaded
  useEffect(() => {
    if (!businessesLoading && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
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
        <div>🏢 Businesses: {businesses.length}</div>
        <div>⚡ Loading: {businessesLoading ? 'Yes' : 'No'}</div>
        <div>🗺️ Vector Tiles: Ready</div>
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