import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (business: any) => void;
  selectedBusiness: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses, onBusinessClick, selectedBusiness }) => {
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
      console.log('Loaded GeoJSON:', data);  // Debug logging
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
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: {
          version: 8,
          name: "Custom Gray",
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#e0e0e0' } // light gray background
            }
          ]
        },
        center: [-73.9712, 40.7831], // NYC center
        zoom: 10,
        attributionControl: false,
        // Constrain bounds to NYC's exact north/south limits
        maxBounds: [
          [-74.5, 40.477], // Southwest coordinates (southernmost point of Staten Island)
          [-73.5, 40.917]  // Northeast coordinates (northernmost point of Bronx)
        ]
      });

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData || !mapInstance) return;

        mapInstance.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Main polygons layer - all your polygon features
        mapInstance.addLayer({
          id: 'polygons',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.6
          }
        });

        // Polygon borders for better definition
        mapInstance.addLayer({
          id: 'polygon-borders',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'line-color': '#2E7D32',
            'line-width': 1,
            'line-opacity': 0.8
          }
        });

        // Keep the existing layers for any parks/water that might be in the data
        mapInstance.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'leisure'], 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.7
          }
        });

        mapInstance.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'natural'], 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.7
          }
        });

        // Remove road layers since your data doesn't contain roads

        // Fit to NYC bounds instead of data bounds
        const nycBounds: [number, number, number, number] = [-74.3, 40.4, -73.6, 40.95];
        mapInstance.fitBounds(nycBounds, {
          padding: 20,
          duration: 1000
        });

        setMap(mapInstance);
      });

      mapInstance.on('error', e => {
        console.error('Map error:', e.error);
      });
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
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#e0e0e0' }}
    />
  );
};

export default MapLibreMap;