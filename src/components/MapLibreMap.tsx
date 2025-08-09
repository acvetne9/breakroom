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

  const createLandFromCoastlines = useCallback((geoData: FeatureCollection): FeatureCollection => {
    try {
      // Extract coastline features
      const coastlines = geoData.features.filter(feature => 
        feature.geometry.type === 'LineString' &&
        feature.properties?.natural === 'coastline'
      );

      if (coastlines.length === 0) {
        console.warn('No coastline features found');
        return { type: 'FeatureCollection', features: [] };
      }

      // Create a large bounding box for the NYC area
      const bbox = [-74.5, 40.3, -73.5, 41.0];
      const outerPolygon = turf.bboxPolygon(bbox);

      // For now, let's create land polygons based on known NYC borough boundaries
      // This is a simplified approach - in reality you'd need more complex polygon operations
      
      const manhattanLand = turf.polygon([[
        [-74.02, 40.70], [-73.97, 40.71], [-73.93, 40.78], [-73.93, 40.82],
        [-73.97, 40.88], [-74.02, 40.87], [-74.02, 40.70]
      ]]);

      const brooklynLand = turf.polygon([[
        [-74.05, 40.57], [-73.88, 40.57], [-73.86, 40.68], [-73.94, 40.73],
        [-74.04, 40.68], [-74.05, 40.57]
      ]]);

      const queensLand = turf.polygon([[
        [-73.96, 40.72], [-73.70, 40.72], [-73.70, 40.80], [-73.96, 40.80],
        [-73.96, 40.72]
      ]]);

      const bronxLand = turf.polygon([[
        [-73.93, 40.82], [-73.76, 40.82], [-73.76, 40.92], [-73.93, 40.92],
        [-73.93, 40.82]
      ]]);

      const statenIslandLand = turf.polygon([[
        [-74.26, 40.50], [-74.05, 40.50], [-74.05, 40.65], [-74.26, 40.65],
        [-74.26, 40.50]
      ]]);

      return {
        type: 'FeatureCollection',
        features: [
          { ...manhattanLand, properties: { landType: 'borough', name: 'Manhattan' } },
          { ...brooklynLand, properties: { landType: 'borough', name: 'Brooklyn' } },
          { ...queensLand, properties: { landType: 'borough', name: 'Queens' } },
          { ...bronxLand, properties: { landType: 'borough', name: 'Bronx' } },
          { ...statenIslandLand, properties: { landType: 'borough', name: 'Staten Island' } }
        ]
      };
    } catch (error) {
      console.error('Error creating land from coastlines:', error);
      return { type: 'FeatureCollection', features: [] };
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

        // Create land polygons from coastlines
        const landPolygons = createLandFromCoastlines(geoData);
        mapInstance!.addSource('land-polygons', {
          type: 'geojson',
          data: landPolygons
        });

        // --- LAND AREAS (gray) - created from coastline boundaries
        mapInstance!.addLayer({
          id: 'land-areas',
          type: 'fill',
          source: 'land-polygons',
          paint: {
            'fill-color': '#DDDDDD', // Gray land
            'fill-opacity': 0.8
          }
        });

        // --- COASTLINES (to show land/water boundaries)
        mapInstance!.addLayer({
          id: 'coastlines',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'natural', 'coastline'] as any,
          paint: {
            'line-color': '#1976D2',
            'line-width': 2
          }
        });

        // --- SPECIFIC WATER FEATURES (blue overlays)
        mapInstance!.addLayer({
          id: 'water-bodies',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'water'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'rivers-poly',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'riverbank'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // --- PARKS (green overlay on land)
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

        // --- ROADS (gray infrastructure)
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['has', 'highway'] as any,
          paint: {
            'line-color': '#424242',
            'line-width': [
              'match',
              ['get', 'highway'],
              'motorway', 3,
              'trunk', 2.5,
              'primary', 2,
              'secondary', 1.5,
              1
            ]
          }
        });

        // --- RIVERS (blue lines)
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

        // --- CANALS (blue lines)
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
  }, [loadGeoJSONData, createLandFromCoastlines]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;