import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Turf imports
import buffer from '@turf/buffer';
import union from '@turf/union';
import difference from '@turf/difference';
import bbox from '@turf/bbox';

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
  
  // Geographic data from second script
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

  // Convert lines (roads, bridges, tunnels) to polygons
  const convertLinesToPolygons = useCallback((lineFeatures: FeatureCollection<LineString>) => {
    const buffered: Feature<Polygon>[] = lineFeatures.features.map(line =>
      buffer(line, 5, { units: 'meters' }) as Feature<Polygon>
    );

    // Merge into one polygon feature
    let merged: Feature<Polygon | MultiPolygon> | null = null;
    for (const poly of buffered) {
      merged = merged ? (union(merged, poly) as Feature<Polygon | MultiPolygon>) : poly;
    }

    return merged;
  }, []);

  // Merge all land into single feature
  const mergeLand = useCallback((fc: FeatureCollection<Polygon | MultiPolygon>) => {
    let merged: Feature<Polygon | MultiPolygon> | null = null;
    for (const feat of fc.features) {
      merged = merged ? (union(merged, feat) as Feature<Polygon | MultiPolygon>) : feat;
    }
    return merged;
  }, []);

  // Merge all water into single feature
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

  // Add geographic data layers (land, water, roads) once map is loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const map = mapRef.current;

    // 1. Merge land & water
    const landFeature = mergeLand(landData);
    const waterFeature = mergeWater(waterData);

    // 2. Remove water from land
    let nycLand = landFeature;
    if (landFeature && waterFeature) {
      nycLand = difference(landFeature, waterFeature) as Feature<Polygon | MultiPolygon>;
    }

    // 3. Convert roads to polygons
    const roadsPolygon = convertLinesToPolygons(roadsData);

    // 4. Add land layer
    if (nycLand) {
      map.addSource('nyc-land', {
        type: 'geojson',
        data: nycLand
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

    // 5. Add water layer
    if (waterFeature) {
      map.addSource('nyc-water', {
        type: 'geojson',
        data: waterFeature
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

    // 6. Add roads polygons
    if (roadsPolygon) {
      map.addSource('nyc-roads', {
        type: 'geojson',
        data: roadsPolygon
      });
      map.addLayer({
        id: 'nyc-roads-fill',
        type: 'fill',
        source: 'nyc-roads',
        paint: {
          'fill-color': '#bfbfbf', // darker gray
          'fill-opacity': 1
        }
      });
    }

    // Fit map to all data
    if (nycLand) {
      const bounds = bbox(nycLand) as [number, number, number, number];
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [mapLoaded, roadsData, landData, waterData, mergeLand, mergeWater, convertLinesToPolygons]);

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