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
  addParksAndCemeteriesLayer,
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
  const { isProcessing, setIsProcessing, loadAllDataCenterOut } = useViewportMapData();
  const { 
    businesses, 
    loading: businessesLoading, 
    loadBusinessesInViewport, 
    fetchFullBusinessDetails,
    clusterBusinesses,
    isSearching
  } = useViewportBusinesses(searchFilters);
  const processedRef = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(12);
  const layersAddedRef = useRef(false);
  const lastFitKeyRef = useRef<string | null>(null);

  // Fixed business click handler with better error handling and simpler logic
  const handleBusinessClick = useCallback(async (business: any) => {
    console.log('Business clicked:', business?.name || business?.id);
    
    if (!business) {
      console.error('No business data provided to click handler');
      return;
    }

    try {
      if (onBusinessClick) {
        if (!business.atmosphere?.length && !business.roles?.length && business.id) {
          const fullBusinessPromise = fetchFullBusinessDetails(business.id);
          onBusinessClick(business);
          try {
            const fullBusiness = await fullBusinessPromise;
            if (fullBusiness && onBusinessClick) {
              onBusinessClick(fullBusiness);
            }
          } catch (fetchError) {
            console.warn('Failed to fetch full business details:', fetchError);
          }
        } else {
          onBusinessClick(business);
        }
      }
      
      if (map && business.position) {
        const currentZoom = map.getZoom();
        const targetZoom = Math.max(currentZoom, 16);
        
        map.easeTo({
          center: [business.position.lng, business.position.lat],
          zoom: targetZoom,
          duration: 800
        });
      }
      
    } catch (error) {
      console.error('Error in business click handler:', error);
      if (onBusinessClick) {
        onBusinessClick(business);
      }
    }
  }, [fetchFullBusinessDetails, onBusinessClick, map]);

  const isMovingRef = useRef(false);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hideVectorBusinesses, setHideVectorBusinesses] = useState(false);

  const handleViewportChange = useCallback((isInitial: boolean = false) => {
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
      console.error('Error in handleViewportChange:', error);
    }
  }, [map, mapLoaded, isMobile, searchFilters]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (searchFilters === undefined) return;
    
    if (searchFilters && Object.keys(searchFilters).length > 0) {
      setHideVectorBusinesses(true);
    } else {
      setHideVectorBusinesses(false);
    }
    
    if (searchFilters === null) {
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
        console.warn('Failed to reload normal businesses:', e);
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
        loadBusinessesInViewport(viewportBounds, businessLimit, false);
      }
    } catch (e) {
      console.warn('Failed to reload businesses on filter change:', e);
    }
  }, [searchFilters, map, mapLoaded, isMobile, loadBusinessesInViewport]);

  useEffect(() => {
    if (!map || !mapLoaded || !selectedBusiness?.position) return;
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 800
    });
  }, [selectedBusiness?.id, map, mapLoaded]);

  useEffect(() => {
    if (!map || !mapLoaded || !neighborhoodCenter) return;
    map.easeTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 1000
    });
  }, [neighborhoodCenter, map, mapLoaded]);

  const processMapFeatures = useCallback(async () => {
    if (processedRef.current || (window as any).__MAP_FEATURES_PROCESSED__) return;
    if (!map || !mapLoaded) return;
    processedRef.current = true;
    (window as any).__MAP_FEATURES_PROCESSED__ = true;
    setIsProcessing(true);
    console.log('NYC .pbf vector tiles ready');
    setIsProcessing(false);
  }, [map, mapLoaded]);

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
      console.error('Error creating map instance:', error);
      return;
    }

    mapInstance.on('load', () => {
      if (cleanedUp) return;
      setMapLoaded(true);
      if (onMapLoaded) onMapLoaded();
    });

    mapInstance.on('error', e => {
      console.error('Map error:', e.error);
    });
    
    mapInstance.on('sourcedata', e => {
      if (e.sourceId === 'nyc-tiles' && mapInstance?.isSourceLoaded('nyc-tiles')) {
        if (layersAddedRef.current) return;
        try {
          const features = mapInstance.querySourceFeatures('nyc-tiles');
          const sourceLayers = Array.from(new Set(features.map((f: any) => f.sourceLayer)));
          console.log('Detected source-layers:', sourceLayers);
          
          const addMapLayers = (mapInstance: maplibregl.Map) => {
            if (sourceLayers.includes('landuse')) {
              mapInstance.addLayer({
                id: 'nyc-land',
                type: 'fill',
                source: 'nyc-tiles',
                'source-layer': 'landuse',
                paint: { 'fill-color': '#F5F5DC', 'fill-opacity': 1 }
              });
            }
            if (sourceLayers.includes('water')) {
              mapInstance.addLayer({
                id: 'nyc-water',
                type: 'fill',
                source: 'nyc-tiles',
                'source-layer': 'water',
                paint: { 'fill-color': '#6CA4E1', 'fill-opacity': 1 }
              });
            }
            if (sourceLayers.includes('transportation')) {
              mapInstance.addLayer({
                id: 'nyc-roads',
                type: 'line',
                source: 'nyc-tiles',
                'source-layer': 'transportation',
                paint: { 'line-color': '#666666', 'line-width': 1.5 }
              });
            }
          };
          
          addMapLayers(mapInstance);
          layersAddedRef.current = true;
        } catch (err) {
          console.warn('Layer addition failed:', err);
        }
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
  }, []);

  useEffect(() => {
    if (mapLoaded && map && !processedRef.current) {
      processMapFeatures();
    }
  }, [mapLoaded, map, processMapFeatures]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    let moveTimeout: NodeJS.Timeout | null = null;
    const moveEndHandler = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        isMovingRef.current = false;
        handleViewportChange();
      }, 300);
    };
    map.on('moveend', moveEndHandler);
    handleViewportChange(true);
    return () => {
      map.off('moveend', moveEndHandler);
      if (moveTimeout) clearTimeout(moveTimeout);
    };
  }, [map, mapLoaded, handleViewportChange]);

  useEffect(() => {
    if (!mapLoaded || !map) return;
    if (map?.getLayer('businesses-layer')) {
      map.removeLayer('businesses-layer');
    }
    if (map?.getSource('businesses')) {
      map.removeSource('businesses');
    }
    if (map?.getLayer('nyc-businesses')) {
      map.setLayoutProperty('nyc-businesses', 'visibility', 'none');
    }
  }, [mapLoaded, map]);
  
  useEffect(() => {
    if (!map || !mapLoaded) return;
    if (map?.getLayer('nyc-businesses')) {
      const visibility = hideVectorBusinesses ? 'none' : 'visible';
      map.setLayoutProperty('nyc-businesses', 'visibility', visibility);
    }
  }, [hideVectorBusinesses, map, mapLoaded]);

  useEffect(() => {
    if (!businessesLoading && businesses.length > 0 && onBusinessesLoaded) {
      onBusinessesLoaded();
    }
  }, [businessesLoading, businesses.length, onBusinessesLoaded]);

  const [lastLandmarksHash, setLastLandmarksHash] = useState('');
  
  useEffect(() => {
    if (!mapLoaded || !landmarks || !map) return;
    const landmarksHash = JSON.stringify(landmarks.map(l => `${l.lat}-${l.lng}-${l.emoji}`));
    if (landmarksHash === lastLandmarksHash) return;
    setLastLandmarksHash(landmarksHash);
    landmarkMarkersRef.current.forEach(m => m.remove());
    landmarkMarkersRef.current = [];
    if (landmarks.length === 0) return;

    try {
      const newMarkers: maplibregl.Marker[] = landmarks.map((landmark) => {
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

        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([landmark.lng, landmark.lat])
          .addTo(map);
      });
      landmarkMarkersRef.current = newMarkers;
    } catch (error) {
      console.error('Error adding emoji markers:', error);
    }
  }, [mapLoaded, landmarks, map, lastLandmarksHash]);

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
