import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (business: any) => void;
  selectedBusiness: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness
}) => {
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
      const baseStyle = {
        version: 8 as const,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': '#2196F3' } // Blue background for water
          }
        ]
      };

      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: baseStyle,
        center: [-73.9712, 40.7831],
        zoom: 12
      });

      const nycBounds: maplibregl.LngLatBoundsLike = [
        [-74.25909, 40.477399],
        [-73.700272, 40.917577]
      ];
      mapInstance.setMaxBounds(nycBounds);

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData || !geoData.features.length) {
          console.warn('No GeoJSON features loaded.');
          return;
        }

        // Fit map to data
        try {
          const bbox2d = turf.bbox(geoData) as [number, number, number, number];
          if (bbox2d[0] !== bbox2d[2] && bbox2d[1] !== bbox2d[3]) {
            mapInstance!.fitBounds(bbox2d, { padding: 100, duration: 1000 });
          }
        } catch (err) {
          console.warn('Could not calculate bbox:', err);
        }

        // Main data source
        mapInstance!.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // --- ALL POLYGONS as gray land (no filtering at all)
        mapInstance!.addLayer({
          id: 'all-polygons',
          type: 'fill',
          source: 'geojson-data',
          paint: {
            'fill-color': '#9E9E9E', // Gray for all polygons
            'fill-opacity': 0.8
          }
        });

        // --- Water features (blue overlays on top of gray)
        // Natural water
        mapInstance!.addLayer({
          id: 'water1',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'water'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Riverbanks
        mapInstance!.addLayer({
          id: 'water2',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'riverbank'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Reservoirs
        mapInstance!.addLayer({
          id: 'water3',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'landuse', 'reservoir'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Water property
        mapInstance!.addLayer({
          id: 'water4',
          type: 'fill',
          source: 'geojson-data',
          filter: ['has', 'water'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Sea/bay features
        mapInstance!.addLayer({
          id: 'water5',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'sea'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        mapInstance!.addLayer({
          id: 'water6',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'natural', 'bay'] as any,
          paint: {
            'fill-color': '#2196F3',
            'fill-opacity': 0.9
          }
        });

        // Parks (green overlay)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: ['==', 'leisure', 'park'] as any,
          paint: {
            'fill-color': '#4CAF50',
            'fill-opacity': 0.6
          }
        });

        // Roads (lines)
        mapInstance!.addLayer({
          id: 'roads',
          type: 'line',
          source: 'geojson-data',
          filter: ['has', 'highway'] as any,
          paint: {
            'line-color': '#424242',
            'line-width': 1.5
          }
        });

        // Water lines (rivers, coastlines)
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'natural', 'coastline'] as any,
          paint: {
            'line-color': '#1976D2',
            'line-width': 2
          }
        });

        mapInstance!.addLayer({
          id: 'rivers',
          type: 'line',
          source: 'geojson-data',
          filter: ['==', 'waterway', 'river'] as any,
          paint: {
            'line-color': '#2196F3',
            'line-width': 2
          }
        });
      });

      mapInstance.on('error', e => {
        console.error('Map error:', e.error);
      });

      setMap(mapInstance);
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