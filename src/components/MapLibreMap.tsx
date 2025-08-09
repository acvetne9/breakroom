import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Turf imports
import buffer from '@turf/buffer';
import union from '@turf/union';
import difference from '@turf/difference';
import bbox from '@turf/bbox';

// Props interface
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

  roadsData: FeatureCollection<LineString>;
  landData: FeatureCollection<Polygon | MultiPolygon>;
  waterData: FeatureCollection<Polygon | MultiPolygon>;
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

  // --- Utility to dynamically get color from feature properties ---
  const getFeatureColor = (fallback: string) => [
    'case',
    ['has', 'color'],
    ['get', 'color'],
    fallback
  ];

  // Convert lines (roads, bridges, tunnels) to polygons
  const convertLinesToPolygons = useCallback((lineFeatures: FeatureCollection<LineString>) => {
    const buffered: Feature<Polygon>[] = lineFeatures.features.map(line =>
      buffer(line, 5, { units: 'meters' }) as Feature<Polygon>
    );

    let merged: Feature<Polygon | MultiPolygon> | null = null;
    for (const poly of buffered) {
      merged = merged ? (union(merged, poly) as Feature<Polygon | MultiPolygon>) : poly;
    }
    return merged;
  }, []);

  // Merge all land
  const mergeLand = useCallback((fc: FeatureCollection<Polygon | MultiPolygon>) => {
    let merged: Feature<Polygon | MultiPolygon> | null = null;
    for (const feat of fc.features) {
      merged = merged ? (union(merged, feat) as Feature<Polygon | MultiPolygon>) : feat;
    }
    return merged;
  }, []);

  // Merge all water
  const mergeWater = useCallback((fc: FeatureCollection<Polygon | MultiPolygon>) => {
    let merged: Feature<Polygon | MultiPolygon> | null = null;
    for (const feat of fc.features) {
      merged = merged ? (union(merged, feat) as Feature<Polygon | MultiPolygon>) : feat;
    }
    return merged;
  }, []);

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

  // Add geographic data layers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Merge land and water
    const landFeature = mergeLand(landData);
    const waterFeature = mergeWater(waterData);

    // Remove water from land
    let nycLand = landFeature;
    if (landFeature && waterFeature) {
      nycLand = difference(landFeature, waterFeature) as Feature<Polygon | MultiPolygon>;
    }

    // Convert roads to polygons
    const roadsPolygon = convertLinesToPolygons(roadsData);

    // Land
    if (nycLand) {
      map.addSource('nyc-land', { type: 'geojson', data: nycLand });
      map.addLayer({
        id: 'nyc-land-fill',
        type: 'fill',
        source: 'nyc-land',
        paint: {
          'fill-color': getFeatureColor('#d9d9d9'),
          'fill-opacity': 1
        }
      });
    }

    // Water
    if (waterFeature) {
      map.addSource('nyc-water', { type: 'geojson', data: waterFeature });
      map.addLayer({
        id: 'nyc-water-fill',
        type: 'fill',
        source: 'nyc-water',
        paint: {
          'fill-color': getFeatureColor('#4da6ff'),
          'fill-opacity': 1
        }
      });
    }

    // Roads
    if (roadsPolygon) {
      map.addSource('nyc-roads', { type: 'geojson', data: roadsPolygon });
      map.addLayer({
        id: 'nyc-roads-fill',
        type: 'fill',
        source: 'nyc-roads',
        paint: {
          'fill-color': getFeatureColor('#bfbfbf'),
          'fill-opacity': 1
        }
      });
    }

    // Fit bounds
    if (nycLand) {
      const bounds = bbox(nycLand) as [number, number, number, number];
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [mapLoaded, roadsData, landData, waterData, mergeLand, mergeWater, convertLinesToPolygons]);

  // Add business markers
  useEffect(() => {
    if (!mapLoaded || !businesses || !mapRef.current) return;
    const map = mapRef.current;

    // Remove old
    if (map.getSource('businesses')) {
      map.removeLayer('businesses-layer');
      map.removeSource('businesses');
    }

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

    map.addSource('businesses', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: businessFeatures
      }
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

    map.on('mouseenter', 'businesses-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'businesses-layer', () => {
      map.getCanvas().style.cursor = '';
    });

  }, [mapLoaded, businesses, onBusinessClick]);

  // Highlight selected business
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer('businesses-layer') && selectedBusiness) {
      map.setPaintProperty('businesses-layer', 'circle-color', [
        'case',
        ['==', ['get', 'id'], selectedBusiness.id],
        '#EF4444',
        '#3B82F6'
      ]);
    }
  }, [mapLoaded, selectedBusiness]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
