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
      // Create a simple gray background style
      const grayStyle = {
        version: 8 as const,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: {
              'background-color': '#f0f0f0' // Light gray background
            }
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: grayStyle, // Use gray background instead of demo tiles
        center: [-73.9712, 40.7831], // NYC
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399], // SW
        [-73.700272, 40.917577], // NE
      ];
      
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData) return;

        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Optional custom layers for your polygon-based data:
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', 'leisure', 'park']],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.6
          }
        });

        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['==', 'natural', 'water']],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.7
          }
        });

        // Landuse areas (residential, commercial, etc.)
        mapInstance!.addLayer({
          id: 'landuse',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['has', 'landuse']],
          paint: {
            'fill-color': [
              'match',
              ['get', 'landuse'],
              'residential', '#FFF3E0',
              'commercial', '#F3E5F5',
              'industrial', '#E8F5E8',
              'forest', '#C8E6C9',
              'grass', '#DCEDC8',
              '#E0E0E0' // default gray
            ],
            'fill-opacity': 0.4
          }
        });

        // Natural features (besides water)
        mapInstance!.addLayer({
          id: 'natural',
          type: 'fill',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'Polygon'], ['has', 'natural'], ['!=', 'natural', 'water']],
          paint: {
            'fill-color': [
              'match',
              ['get', 'natural'],
              'coastline', '#FFE0B2',
              'beach', '#FFF8E1',
              'wood', '#C8E6C9',
              '#E8F5E8' // default light green
            ],
            'fill-opacity': 0.5
          }
        });

        // Coastline as lines (if any LineString features exist)
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: ['all', ['==', '$type', 'LineString'], ['==', 'natural', 'coastline']],
          paint: {
            'line-color': '#795548',
            'line-width': 2
          }
        });

        // Zoom to data bounds (optional)
        const bbox = turf.bbox(geoData);
        mapInstance!.fitBounds(bbox as [number, number, number, number], {
          padding: 100,
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
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
};

export default MapLibreMap;