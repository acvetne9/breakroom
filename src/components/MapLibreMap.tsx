import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
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
      const response = await fetch('/data/nyc.geojson'); // your local NYC boundaries + water + parks
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      return await response.json();
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
          name: "Local Data Map",
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#dcdcdc' } // base gray background
            }
          ]
        },
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

        console.log('Loaded GeoJSON data:', geoData); // Debug log

        mapInstance.addSource('nyc-data', {
          type: 'geojson',
          data: geoData
        });

        // Water - using simplified filter that matches your data
        mapInstance.addLayer({
          id: 'water',
          type: 'fill',
          source: 'nyc-data',
          filter: ['==', ['get', 'natural'], 'water'],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.8,
            'fill-outline-color': '#1976D2'
          }
        });

        // Parks/green spaces - check for leisure=park or natural=park
        mapInstance.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'leisure'], 'park'],
            ['==', ['get', 'natural'], 'park'],
            ['==', ['get', 'landuse'], 'recreation_ground']
          ],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.7,
            'fill-outline-color': '#4CAF50'
          }
        });

        // Land - everything else that's a polygon but not water or parks
        mapInstance.addLayer({
          id: 'land',
          type: 'fill',
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['!=', ['get', 'natural'], 'water'],
            ['!=', ['get', 'leisure'], 'park'],
            ['!=', ['get', 'natural'], 'park'],
            ['!=', ['get', 'landuse'], 'recreation_ground']
          ],
          paint: {
            'fill-color': '#f0f0f0',
            'fill-opacity': 0.8,
            'fill-outline-color': '#cccccc'
          }
        });

        // Roads - check for various highway types
        mapInstance.addLayer({
          id: 'roads-major',
          type: 'line',
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'LineString'],
            [
              'in',
              ['get', 'highway'],
              ['literal', ['primary', 'secondary', 'trunk', 'motorway', 'primary_link', 'secondary_link']]
            ]
          ],
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'case',
              ['in', ['get', 'highway'], ['literal', ['motorway', 'trunk']]], 4,
              ['in', ['get', 'highway'], ['literal', ['primary', 'primary_link']]], 3,
              2
            ],
            'line-opacity': 0.8
          }
        });

        // Minor roads
        mapInstance.addLayer({
          id: 'roads-minor',
          type: 'line',
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'LineString'],
            [
              'in',
              ['get', 'highway'],
              ['literal', ['tertiary', 'residential', 'unclassified', 'service']]
            ]
          ],
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.6
          }
        });

        // Add click handlers for debugging
        mapInstance.on('click', 'water', (e) => {
          console.log('Water feature clicked:', e.features?.[0]?.properties);
        });

        mapInstance.on('click', 'parks', (e) => {
          console.log('Park feature clicked:', e.features?.[0]?.properties);
        });

        mapInstance.on('click', 'land', (e) => {
          console.log('Land feature clicked:', e.features?.[0]?.properties);
        });

        // Log layer information for debugging
        console.log('Map layers added. Available sources:', mapInstance.getStyle().sources);
        
        // Check if data is actually loaded
        setTimeout(() => {
          const source = mapInstance?.getSource('nyc-data') as maplibregl.GeoJSONSource;
          if (source) {
            console.log('Source loaded successfully');
          }
        }, 1000);

        setMap(mapInstance);
      });

      // Add error handling
      mapInstance.on('error', (e) => {
        console.error('Map error:', e);
      });

      mapInstance.on('sourcedata', (e) => {
        if (e.sourceId === 'nyc-data' && e.isSourceLoaded) {
          console.log('NYC data source loaded successfully');
        }
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
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;