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
            paint: { 'background-color': '#e5e5e5' } // Light gray background land
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

        // --- Build ocean background outside of land polygons
        const mapBbox: [number, number, number, number] = [-75, 40.2, -73, 41.2];
        const oceanPoly = turf.bboxPolygon(mapBbox);

        // Extract land polygons
        const landFeatures = geoData.features.filter(f =>
          (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
          !(
            (f.properties?.natural === 'water') ||
            (f.properties?.water) ||
            (f.properties?.natural === 'sea') ||
            (f.properties?.water === 'ocean') ||
            (f.properties?.water === 'bay') ||
            (f.properties?.landuse === 'reservoir') ||
            (f.properties?.waterway)
          )
        );

        let oceanWithHoles = oceanPoly;
        if (landFeatures.length > 0) {
          try {
            // Clean geometries before union/difference
            const flattened = turf.flatten({ type: 'FeatureCollection', features: landFeatures });
            const unioned = turf.union(...flattened.features as any);
            if (unioned) {
              oceanWithHoles = turf.difference(oceanPoly, unioned) || oceanPoly;
            }
          } catch (err) {
            console.warn('Could not subtract land from ocean polygon:', err);
          }
        }

        mapInstance!.addSource('ocean', { type: 'geojson', data: oceanWithHoles });
        mapInstance!.addLayer({
          id: 'ocean',
          type: 'fill',
          source: 'ocean',
          paint: {
            'fill-color': '#64B5F6', // Blue water
            'fill-opacity': 0.7
          }
        });

        // --- Water polygons from data
        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['any',
              ['==', ['get', 'natural'], 'water'],
              ['==', ['get', 'natural'], 'sea'],
              ['==', ['get', 'natural'], 'bay'],
              ['==', ['get', 'water'], 'ocean'],
              ['==', ['get', 'water'], 'bay'],
              ['==', ['get', 'water'], 'river'],
              ['==', ['get', 'waterway'], 'riverbank'],
              ['has', 'water']
            ]
          ],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 0.85
          }
        });

        // --- Parks
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

        // --- Roads
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
              0.8
            ]
          }
        });

        // --- Coastline
        mapInstance!.addLayer({
          id: 'coastline',
          type: 'line',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['any',
              ['==', ['get', 'natural'], 'coastline'],
              ['==', ['get', 'natural'], 'shoreline']
            ]
          ],
          paint: {
            'line-color': '#5D4037',
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
