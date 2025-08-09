import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (business: any) => void;
  selectedBusiness: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      const data: FeatureCollection = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      const baseStyle = {
        version: 8 as const,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#2196F3' } // Blue background for water
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399],
        [-73.700272, 40.917577]
      ];
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData || !geoData.features.length) {
          console.warn('No GeoJSON features loaded.');
          return;
        }

        // Fit map to data
        try {
          const bbox2d = turf.bbox(geoData) as [number, number, number, number];
          if (bbox2d[0] !== bbox2d[2] && bbox2d[1] !== bbox2d[3]) {
            mapInstance!.fitBounds(bbox2d, { padding: 100, duration: 1000 });
          }
        } catch (err) {
          console.warn('Could not calculate bbox:', err);
        }

        // Main data source
        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // --- LAND STRATEGY: Target specific land use types
        
        // Residential areas
        mapInstance!.addLayer({
          id: 'residential',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'residential'] as any,
          paint: {
            'fill-color': '#BDBDBD', // Light gray for residential
            'fill-opacity': 0.8
          }
        });

        // Commercial areas
        mapInstance!.addLayer({
          id: 'commercial',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'commercial'] as any,
          paint: {
            'fill-color': '#9E9E9E', // Medium gray for commercial
            'fill-opacity': 0.8
          }
        });

        // Industrial areas
        mapInstance!.addLayer({
          id: 'industrial',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'industrial'] as any,
          paint: {
            'fill-color': '#757575', // Darker gray for industrial
            'fill-opacity': 0.8
          }
        });

        // Built-up areas (buildings, construction)
        mapInstance!.addLayer({
          id: 'built-up',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'construction'] as any,
          paint: {
            'fill-color': '#9E9E9E',
            'fill-opacity': 0.7
          }
        });

        // Administrative boundaries (often represent developed areas)
        mapInstance!.addLayer({
          id: 'admin-areas',
          type: 'fill',
          source: 'geojson-data',
          filter: ['has', 'admin_level'] as any,
          paint: {
            'fill-color': '#EEEEEE', // Very light gray for admin areas
            'fill-opacity': 0.3
          }
        });

        // Places (cities, neighborhoods, etc.)
        mapInstance!.addLayer({
          id: 'places',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'place', 'city'] as any,
          paint: {
            'fill-color': '#9E9E9E',
            'fill-opacity': 0.5
          }
        });

        mapInstance!.addLayer({
          id: 'neighborhoods',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'place', 'neighbourhood'] as any,
          paint: {
            'fill-color': '#BDBDBD',
            'fill-opacity': 0.4
          }
        });

        // Islands (definitely land)
        mapInstance!.addLayer({
          id: 'islands',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'place', 'island'] as any,
          paint: {
            'fill-color': '#9E9E9E',
            'fill-opacity': 0.8
          }
        });

        // Landuse areas that are clearly land
        mapInstance!.addLayer({
          id: 'retail',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'retail'] as any,
          paint: {
            'fill-color': '#9E9E9E',
            'fill-opacity': 0.8
          }
        });

        mapInstance!.addLayer({
          id: 'education',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'education'] as any,
          paint: {
            'fill-color': '#9E9E9E',
            'fill-opacity': 0.7
          }
        });

        // --- PARKS AND GREEN SPACES (on land, so gray base with green tint)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'leisure', 'park'] as any,
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.7
          }
        });

        mapInstance!.addLayer({
          id: 'recreation',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'recreation_ground'] as any,
          paint: {
            'fill-color': '#66BB6A',
            'fill-opacity': 0.6
          }
        });

        // --- WATER FEATURES (keep these blue)
        mapInstance!.addLayer({
          id: 'water-natural',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'water'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-riverbank',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'riverbank'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // --- TRANSPORTATION (gray infrastructure on land)
        mapInstance!.addLayer({
          id: 'roads-major',
          type: 'line',
          source: 'geojson-data',
          filter: ['in', 'highway', 'motorway', 'trunk', 'primary'] as any,
          paint: {
            'line-color': '#424242',
            'line-width': 3
          }
        });

        mapInstance!.addLayer({
          id: 'roads-minor',
          type: 'line',
          source: 'geojson-data',
          filter: ['in', 'highway', 'secondary', 'tertiary', 'residential'] as any,
          paint: {
            'line-color': '#616161',
            'line-width': 1.5
          }
        });

        // --- COASTLINES (to define land boundaries)
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'natural', 'coastline'] as any,
          paint: {
            'line-color': '#1976D2',
            'line-width': 2
          }
        });

        // --- WATER LINES
        mapInstance!.addLayer({
          id: 'rivers',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'river'] as any,
          paint: {
            'line-color': '#2196F3',
            'line-width': 3
          }
        });

        mapInstance!.addLayer({
          id: 'canals',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'canal'] as any,
          paint: {
            'line-color': '#2196F3',
            'line-width': 2
          }
        });

        // --- Create a large land polygon for NYC area
        const nycLandBounds = turf.bboxPolygon([-74.25, 40.47, -73.70, 40.92]);
        mapInstance!.addSource('nyc-land', {
          type: 'geojson',
          data: nycLandBounds
        });

        mapInstance!.addLayer({
          id: 'nyc-base-land',
          type: 'fill',
          source: 'nyc-land',
          paint: {
            'fill-color': '#E0E0E0', // Very light gray base for all of NYC
            'fill-opacity': 0.3
          }
        }, 'residential'); // Add this layer below other land layers
      });

      mapInstance.on('error', e => {
        console.error('Map error:', e.error);
      });

      setMap(mapInstance);
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        mapInstance.remove();
      }
      setMap(null);
    };
  }, [loadGeoJSONData]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibre