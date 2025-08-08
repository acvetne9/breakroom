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

        mapInstance.addSource('nyc-data', {
          type: 'geojson',
          data: geoData
        });

        // Land
        mapInstance.addLayer({
          id: 'land',
          type: 'fill',
          source: 'nyc-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'natural'], 'water']],
          paint: {
            'fill-color': '#f0f0f0',
            'fill-opacity': 1
          }
        });

        // Water
        mapInstance.addLayer({
          id: 'water',
          type: 'fill',
          source: 'nyc-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'natural'], 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 1
          }
        });

        // Parks
        mapInstance.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'nyc-data',
          filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'leisure'], 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.8
          }
        });

        // Roads (optional, if in your data)
        mapInstance.addLayer({
          id: 'roads',
          type: 'line',
          source: 'nyc-data',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'highway'], 'primary']],
          paint: {
            'line-color': '#ffffff',
            'line-width': 2
          }
        });

        setMap(mapInstance);
      });
    };

    initializeMap();

    return
