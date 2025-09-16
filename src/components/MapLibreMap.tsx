import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { createBusinessScatterplotLayer, createBusinessClusterLayer } from '@/utils/deckGLLayers';
import { useViewportMapData } from '../hooks/useViewportMapData';
import { useViewportBusinesses } from '../hooks/useViewportBusinesses';
import { useIsMobile } from '../hooks/use-mobile';
import { isCapacitor, createTileBlobUrl } from '@/utils/tileDecompression';
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

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface ViewportState {
  bounds: Bounds;
  zoom: number;
  timestamp: number;
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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  // Refs
  const businessCacheRef = useRef<any>(null);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const layersAddedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastViewportRef = useRef<ViewportState | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // 🔑 Create map once
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      center: [-73.9857, 40.7484],
      zoom: 11
    });

    mapRef.current.on("load", () => {
      setMapLoaded(true);
      onMapLoaded?.();
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onMapLoaded]);

  // 🔑 Resize handling
  useEffect(() => {
    const handleResize = () => mapRef.current?.resize();
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 🔑 Center map on neighborhood change
  useEffect(() => {
    if (!mapRef.current || !neighborhoodCenter) return;
    mapRef.current.flyTo({
      center: [neighborhoodCenter.lon, neighborhoodCenter.lat],
      zoom: 14,
      duration: 2000
    });
  }, [neighborhoodCenter]);

  // Example: using mapRef directly in handlers
  const handleViewportChange = useCallback(() => {
    if (!mapRef.current || !mapLoaded) return;
    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();
    console.log("Bounds:", bounds.toArray(), "Zoom:", zoom);
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.on("moveend", handleViewportChange);
    return () => {
      mapRef.current?.off("moveend", handleViewportChange);
    };
  }, [handleViewportChange]);

  return <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />;
};

export default MapLibreMap;
