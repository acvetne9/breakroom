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
        zoom: 12,
        attributionControl: false,
        // Restrict map bounds to NYC area
        maxBounds: [
          [-74.5, 40.4], // Southwest coordinates
          [-73.4, 41.1]  // Northeast coordinates
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

        // PARKS layer - fill polygons where leisure=park
        mapInstance.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'leisure'], 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.5
          }
        });

        // WATER layer - fill polygons where natural=water
        mapInstance.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'natural'], 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.6
          }
        });

        // ROADS layer - linestrings (fixed filter syntax)
        mapInstance.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': '#888888',
            'line-width': 2,
            'line-opacity': 0.8
          }
        });

        // Optional: Add different road styling based on highway type
        mapInstance.addLayer({
          id: 'major-roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['all', 
            ['==', ['geometry-type'], 'LineString'],
            ['in', ['get', 'highway'], ['literal', ['primary', 'secondary', 'trunk', 'motorway']]]
          ],
          paint: {
            'line-color': '#666666',
            'line-width': 3,
            'line-opacity': 0.9
          }
        });

        // Only fit to bounds if the data is within reasonable NYC bounds
        try {
          const bbox = turf.bbox(geoData);
          if (bbox && bbox.length === 4) {
            // Check if bbox is within NYC area before fitting
            const [minLng, minLat, maxLng, maxLat] = bbox;
            if (minLng >= -74.5 && maxLng <= -73.4 && minLat >= 40.4 && maxLat <= 41.1) {
              mapInstance.fitBounds(bbox as [number, number, number, number], {
                padding: 50,
                duration: 1000
              });
            }
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