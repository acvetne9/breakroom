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
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#f0f0f0' }
            }
          ]
        },
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData) return;

        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Parks: Polygon where leisure = park
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

        // Water: Polygon where natural = water
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

        // Roads: LineString features, no filter on 'highway' property to be safe
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

        // Fit map to data bounds with padding
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
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#f0f0f0' }}
    />
  );
};

export default MapLibreMap;
