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
        center: [-73.945, 40.789], // Center based on your data
        zoom: 16,
        attributionControl: false,
        // Tight bounds around your data area
        maxBounds: [
          [-73.96, 40.78], // Southwest coordinates
          [-73.93, 40.80]  // Northeast coordinates
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

        // Fit tightly to your data bounds
        try {
          const bbox = turf.bbox(geoData);
          if (bbox && bbox.length === 4) {
            mapInstance.fitBounds(bbox as [number, number, number, number], {
              padding: 20, // Very tight padding
              duration: 1000
            });
          }
        } catch (e) {
          console.error('Error fitting bounds:', e);
        }

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