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
      const response = await fetch('/data/example-points.geojson'); // update path to processed.geojson
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
      const grayStyle = {
        version: 8 as const,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#f0f0f0' }
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: grayStyle,
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399], // SW
        [-73.700272, 40.917577], // NE
      ];
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        // Avoid adding twice
        if (mapInstance!.getSource('geojson-data')) return;

        const geoData = await loadGeoJSONData();
        if (!geoData || !geoData.features.length) {
          console.warn('No GeoJSON features loaded.');
          return;
        }

        // Validate bbox before fit
        try {
          const bbox = turf.bbox(geoData);
          if (bbox[0] !== bbox[2] && bbox[1] !== bbox[3]) {
            mapInstance!.fitBounds(bbox as [number, number, number, number], {
              padding: 100,
              duration: 1000
            });
          }
        } catch (err) {
          console.warn('Could not calculate bbox:', err);
        }

        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // Parks
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['==', ['get', 'leisure'], 'park']
          ],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.6
          }
        });

        // Water (natural=water or has water tag)
        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['any', ['==', ['get', 'natural'], 'water'], ['has', 'water']]
          ],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.7
          }
        });

        // Roads
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['has', 'highway']
          ],
          paint: {
            'line-color': '#555',
            'line-width': [
              'match',
              ['get', 'highway'],
              'motorway', 3,
              'trunk', 2.5,
              'primary', 2.2,
              'secondary', 2,
              'tertiary', 1.5,
              'unclassified', 1.2,
              'residential', 1,
              'living_street', 1,
              0.8 // default
            ]
          }
        });

        // Coastline lines
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['==', ['get', 'natural'], 'coastline']
          ],
          paint: {
            'line-color': '#795548',
            'line-width': 2
          }
        });
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
