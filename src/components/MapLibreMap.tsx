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
            paint: { 'background-color': '#2196F3' } // Blue background (water by default)
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

        // --- Land areas (gray) - no filter, just show all polygons as land first
        mapInstance!.addLayer({
          id: 'land',
          type: 'fill',
          source: 'geojson-data',
          paint: {
            'fill-color': '#9E9E9E', // Gray land
            'fill-opacity': 0.8
          }
        });

        // --- Water bodies (blue) - override land with water features
        // Natural water features
        mapInstance!.addLayer({
          id: 'water-natural',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'natural'], 'water'],
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Waterway riverbanks
        mapInstance!.addLayer({
          id: 'water-riverbank',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'waterway'], 'riverbank'],
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Water landuse (reservoirs)
        mapInstance!.addLayer({
          id: 'water-reservoir',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'landuse'], 'reservoir'],
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Named water bodies
        mapInstance!.addLayer({
          id: 'water-hudson',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'Hudson River'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-east',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'East River'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-harlem',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'Harlem River'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-jamaica-bay',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'Jamaica Bay'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-upper-bay',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'Upper New York Bay'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water-lower-bay',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'name'], 'Lower New York Bay'],
          paint: {
            'fill-color': '#1976D2',
            'fill-opacity': 0.9
          }
        });

        // --- Parks (green overlay)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['get', 'leisure'], 'park'],
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.6
          }
        });

        // --- Roads
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['has', 'highway'],
          paint: {
            'line-color': '#424242',
            'line-width': [
              'match',
              ['get', 'highway'],
              'motorway', 3,
              'trunk', 2.5,
              'primary', 2.2,
              'secondary', 2,
              'tertiary', 1.5,
              'unclassified', 1.2,
              'residential', 1,
              'living_street', 1,
              0.8
            ]
          }
        });

        // --- Coastline
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', ['get', 'natural'], 'coastline'],
          paint: {
            'line-color': '#1976D2',
            'line-width': 1.5
          }
        });

        // --- Rivers as lines
        mapInstance!.addLayer({
          id: 'rivers',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', ['get', 'waterway'], 'river'],
          paint: {
            'line-color': '#2196F3',
            'line-width': 2
          }
        });

        // --- Canals as lines
        mapInstance!.addLayer({
          id: 'canals',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', ['get', 'waterway'], 'canal'],
          paint: {
            'line-color': '#2196F3',
            'line-width': 1.5
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
  }, [loadGeoJSONData]);

  return (
    <div
      ref={mapRef}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;