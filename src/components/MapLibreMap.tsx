import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Turf imports 
import { bbox } from '@turf/turf';

// Props interface combining both functionalities
interface MapLibreMapProps {
  // Business data from first script
  businesses: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: { id: string; text: string; author: string }[];
    businessType?: string;
    roles?: {
      role: string;
      salary: string;
      upvotes?: number;
      downvotes?: number;
      userVote?: 'up' | 'down';
    }[];
    place_id?: string;
  }[];
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
  
  // Geographic data from second script (optional)
  roadsData?: FeatureCollection<LineString>;
  landData?: FeatureCollection<Polygon | MultiPolygon>;
  waterData?: FeatureCollection<Polygon | MultiPolygon>;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ 
  businesses, 
  onBusinessClick, 
  selectedBusiness,
  roadsData, 
  landData, 
  waterData 
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);


  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: [-74.006, 40.7128],
      zoom: 11
    });

    mapRef.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      mapRef.current?.remove();
    };
  }, []);

  // Add geographic data layers (land, water, roads) once map is loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const map = mapRef.current;

    // Skip geographic data if not provided (optional)
    if (!roadsData || !landData || !waterData) {
      return;
    }

    // Add land layer directly without complex processing for now
    if (landData && landData.features && landData.features.length > 0) {
      map.addSource('nyc-land', {
        type: 'geojson',
        data: landData
      });
      map.addLayer({
        id: 'nyc-land-fill',
        type: 'fill',
        source: 'nyc-land',
        paint: {
          'fill-color': '#d9d9d9', // light gray
          'fill-opacity': 1
        }
      });
    }

    // Add water layer
    if (waterData && waterData.features && waterData.features.length > 0) {
      map.addSource('nyc-water', {
        type: 'geojson',
        data: waterData
      });
      map.addLayer({
        id: 'nyc-water-fill',
        type: 'fill',
        source: 'nyc-water',
        paint: {
          'fill-color': '#4da6ff', // blue
          'fill-opacity': 1
        }
      });
    }

    // Add roads as lines instead of polygons
    if (roadsData && roadsData.features && roadsData.features.length > 0) {
      map.addSource('nyc-roads', {
        type: 'geojson',
        data: roadsData
      });
      map.addLayer({
        id: 'nyc-roads-line',
        type: 'line',
        source: 'nyc-roads',
        paint: {
          'line-color': '#bfbfbf', // darker gray
          'line-width': 2
        }
      });
    }

    // Fit map to land data if available
    if (landData && landData.features && landData.features.length > 0) {
      const bounds = bbox(landData) as [number, number, number, number];
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [mapLoaded, roadsData, landData, waterData]);

  // Add business markers to the map
  useEffect(() => {
    if (!mapLoaded || !businesses || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing business markers
    const existingMarkers = map.getSource('businesses');
    if (existingMarkers) {
      map.removeLayer('businesses-layer');
      map.removeSource('businesses');
    }

    // Create GeoJSON from businesses
    const businessFeatures = businesses.map(business => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [business.position.lng, business.position.lat]
      },
      properties: {
        id: business.id,
        name: business.name,
        businessType: business.businessType || 'unknown'
      }
    }));

    const businessFC = {
      type: 'FeatureCollection' as const,
      features: businessFeatures
    };

    // Add business source and layer (on top of other layers)
    map.addSource('businesses', {
      type: 'geojson',
      data: businessFC
    });

    map.addLayer({
      id: 'businesses-layer',
      type: 'circle',
      source: 'businesses',
      paint: {
        'circle-radius': 8,
        'circle-color': '#3B82F6', // blue
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF' // white
      }
    });

    // Add click handler for businesses
    if (onBusinessClick) {
      map.on('click', 'businesses-layer', (e) => {
        if (e.features && e.features[0]) {
          const businessId = e.features[0].properties?.id;
          const business = businesses.find(b => b.id === businessId);
          if (business) {
            onBusinessClick(business);
          }
        }
      });
    }

    // Change cursor on hover
    map.on('mouseenter', 'businesses-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'businesses-layer', () => {
      map.getCanvas().style.cursor = '';
    });

  }, [mapLoaded, businesses, onBusinessClick]);

  // Handle selected business highlighting
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Update business layer styling based on selection
    if (map.getLayer('businesses-layer') && selectedBusiness) {
      map.setPaintProperty('businesses-layer', 'circle-color', [
        'case',
        ['==', ['get', 'id'], selectedBusiness.id],
        '#EF4444', // red for selected
        '#3B82F6'  // blue for unselected
      ]);
    }
  }, [mapLoaded, selectedBusiness]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;