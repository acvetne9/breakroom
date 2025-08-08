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
        center: [-73.9712, 40.7831],
        zoom: 12,
        attributionControl: false
      });

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData) return;

        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // PARKS layer - fill polygons where leisure=park
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', 'leisure', 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.5
          }
        });

        // WATER layer - fill polygons where natural=water
        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', 'natural', 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.6
          }
        });

        // ROADS layer - linestrings
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

        // Fit map to GeoJSON bounds
        try {
          const bbox = turf.bbox(geoData);
          if (bbox && bbox.length === 4) {
            mapInstance!.fitBounds(bbox as [number, number, number, number], {
              padding: 100,
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
