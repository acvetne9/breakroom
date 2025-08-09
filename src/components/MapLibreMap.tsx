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
            paint: { 'background-color': '#2196F3' } // Blue background (water by default)
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

        // --- Land areas (gray)
        mapInstance!.addLayer({
          id: 'land',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['none',
              // Exclude water features
              ['==', ['get', 'natural'], 'water'],
              ['==', ['get', 'natural'], 'sea'],
              ['==', ['get', 'natural'], 'bay'],
              ['==', ['get', 'water'], 'ocean'],
              ['==', ['get', 'water'], 'bay'],
              ['==', ['get', 'water'], 'river'],
              ['==', ['get', 'water'], 'lake'],
              ['==', ['get', 'water'], 'pond'],
              ['==', ['get', 'waterway'], 'riverbank'],
              ['==', ['get', 'landuse'], 'reservoir'],
              ['==', ['get', 'leisure'], 'marina'],
              ['has', 'water']
            ]
          ],
          paint: {
            'fill-color': '#9E9E9E', // Gray land
            'fill-opacity': 0.8
          }
        });

        // --- All water bodies (comprehensive water detection)
        mapInstance!.addLayer({
          id: 'water',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['any',
              // Natural water features
              ['==', ['get', 'natural'], 'water'],
              ['==', ['get', 'natural'], 'sea'],
              ['==', ['get', 'natural'], 'bay'],
              ['==', ['get', 'natural'], 'coastline'],
              ['==', ['get', 'natural'], 'shoreline'],
              // Water tags
              ['==', ['get', 'water'], 'ocean'],
              ['==', ['get', 'water'], 'bay'],
              ['==', ['get', 'water'], 'river'],
              ['==', ['get', 'water'], 'lake'],
              ['==', ['get', 'water'], 'pond'],
              ['==', ['get', 'water'], 'reservoir'],
              ['==', ['get', 'water'], 'canal'],
              // Waterway features
              ['==', ['get', 'waterway'], 'riverbank'],
              ['==', ['get', 'waterway'], 'dock'],
              // Land use water
              ['==', ['get', 'landuse'], 'reservoir'],
              ['==', ['get', 'landuse'], 'basin'],
              // Leisure water
              ['==', ['get', 'leisure'], 'marina'],
              // Generic water property
              ['has', 'water'],
              // Specific named water bodies (common NYC water body names)
              ['in', ['get', 'name'], ['literal', [
                'Hudson River', 'East River', 'Harlem River', 'Gowanus Canal',
                'Newtown Creek', 'Arthur Kill', 'Kill Van Kull', 'The Narrows',
                'Upper New York Bay', 'Lower New York Bay', 'Jamaica Bay',
                'Flushing Bay', 'Bowery Bay', 'Little Hell Gate', 'Bronx River',
                'Hutchinson River', 'Westchester Creek', 'Pelham Bay',
                'Long Island Sound', 'Atlantic Ocean'
              ]]]
            ]
          ],
          paint: {
            'fill-color': '#2196F3', // Blue water
            'fill-opacity': 0.9
          }
        });

        // --- Parks (green overlay on gray land)
        mapInstance!.addLayer({
          id: 'parks',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['any',
              ['==', ['get', 'leisure'], 'park'],
              ['==', ['get', 'landuse'], 'recreation_ground'],
              ['==', ['get', 'landuse'], 'forest'],
              ['==', ['get', 'natural'], 'wood']
            ]
          ],
          paint: {
            'fill-color': '#4CAF50',
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
            'line-color': '#424242',
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

        // --- Coastline (for definition between land and water)
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
            'line-color': '#1976D2', // Darker blue for coastline definition
            'line-width': 1.5
          }
        });

        // --- Water boundaries/edges (rivers, canals as lines)
        mapInstance!.addLayer({
          id: 'waterways',
          type: 'line',
          source: 'geojson-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['any',
              ['==', ['get', 'waterway'], 'river'],
              ['==', ['get', 'waterway'], 'canal'],
              ['==', ['get', 'waterway'], 'stream'],
              ['==', ['get', 'waterway'], 'drain']
            ]
          ],
          paint: {
            'line-color': '#2196F3', // Blue waterways
            'line-width': [
              'match',
              ['get', 'waterway'],
              'river', 3,
              'canal', 2,
              'stream', 1.5,
              1
            ]
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