import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  onMapLoad?: (map: maplibregl.Map) => void;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ onMapLoad }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  // Load GeoJSON from public directory
  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      const response = await fetch('/data/example-points.geojson');
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      const data = await response.json();
      console.log(`Loaded ${data.features?.length || 0} features`);
      return data;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initMap = async () => {
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [-73.9712, 40.7831],
        zoom: 13
      });

      mapInstance.on('load', async () => {
        const geoData = await loadGeoJSONData();
        if (!geoData || isCleanedUp) return;

        // Add GeoJSON source
        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Parks
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', ['get', 'leisure'], 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.5
          }
        });

        // Water
        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', ['get', 'natural'], 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.6
          }
        });

        // Roads (LineStrings)
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': '#888888',
            'line-width': 1.5
          }
        });

        // Debug: Show all polygons (optional)
        /*
        mapInstance!.addLayer({
          id: 'all-polygons',
          type: 'fill',
          source: 'geojson-data',
          paint: {
            'fill-color': '#e91e63',
            'fill-opacity': 0.4,
            'fill-outline-color': '#000'
          }
        });
        */

        // Fit to bounds
        const bbox = turf.bbox(geoData);
        mapInstance!.fitBounds(bbox as [number, number, number, number], { padding: 40 });

        if (!isCleanedUp) {
          setMap(mapInstance!);
          onMapLoad?.(mapInstance!);
        }
      });

      mapInstance.on('error', (e) => {
        console.error('Map error:', e);
      });
    };

    initMap();

    return () => {
      isCleanedUp = true;
      try {
        mapInstance?.remove();
      } catch (e) {
        console.warn('Map cleanup error:', e);
      }
      setMap(null);
    };
  }, [loadGeoJSONData, onMapLoad]);

  return (
    <div
      ref={mapRef}
      className="absolute inset-0 w-full h-full"
      style={{ backgroundColor: '#f0f0f0' }}
    />
  );
};

export default MapLibreMap;
