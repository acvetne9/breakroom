import React, { useEffect, useRef, useState } from 'react';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
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
}


const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses, onBusinessClick, selectedBusiness }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Utility: always return a FeatureCollection
  const toFeatureCollection = (
    input: FeatureCollection | Feature
  ): FeatureCollection => {
    if (!input) return turf.featureCollection([]);
    if (input.type === 'FeatureCollection') return input;
    return turf.featureCollection([input]);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center: [-74.006, 40.7128],
      zoom: 11,
    });

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Add business markers to the map
  useEffect(() => {
    if (!mapLoaded || !businesses) return;
    const map = mapRef.current;
    if (!map) return;

    // Remove existing markers
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

    // Add source and layer
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
        'circle-color': '#3B82F6',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF'
      }
    });

    // Add click handler
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

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
