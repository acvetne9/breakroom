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
        style: 'https://demotiles.maplibre.org/style.json', // full default style with roads, labels, etc.
        center: [-73.9712, 40.7831],
        zoom: 10,
        attributionControl: false,
        maxBounds: [
          [-74.5, 40.477],
          [-73.5, 40.917]
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
      
        // NYC land - light gray
        mapInstance.addLayer({
          id: 'nyc-land',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['!=', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#f0f0f0',
            'fill-opacity': 1
          }
        });
      
        // Water - bright blue
        mapInstance.addLayer({
          id: 'water-custom',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['==', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 1
          }
        });
      
        // Parks - green
        mapInstance.addLayer({
          id: 'parks-custom',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['==', ['get', 'leisure'], 'park']
          ],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.8
          }
        });
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