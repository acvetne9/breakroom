// src/components/MapLibreMap.tsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';

// Turf direct imports to avoid TS2554 errors
import buffer from '@turf/buffer';
import union from '@turf/union';
import lineToPolygon from '@turf/line-to-polygon';
import booleanIntersects from '@turf/boolean-intersects';

interface MapLibreMapProps {
  nycLand: FeatureCollection<Polygon | MultiPolygon>;
  nycWater: FeatureCollection<Polygon | MultiPolygon>;
  roads: FeatureCollection<LineString>;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ nycLand, nycWater, roads }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#d0d0d0' // default land outside NYC
            }
          }
        ]
      },
      center: [-74.006, 40.7128],
      zoom: 11
    });

    mapRef.current = map;

    map.on('load', () => {
      // --- 1. Union NYC Land so it's a single Feature ---
      let unitedLand: Feature<Polygon | MultiPolygon> | null = null;
      if (nycLand.features.length > 1) {
        unitedLand = nycLand.features.reduce((acc, feat) => {
          return acc ? union(acc, feat as Feature<Polygon | MultiPolygon>)! : (feat as Feature<Polygon | MultiPolygon>);
        }, null as Feature<Polygon | MultiPolygon> | null);
      } else {
        unitedLand = nycLand.features[0] as Feature<Polygon | MultiPolygon>;
      }

      // --- 2. Add NYC Land Layer ---
      map.addSource('nyc-land', {
        type: 'geojson',
        data: unitedLand as Feature<Polygon | MultiPolygon>
      });
      map.addLayer({
        id: 'nyc-land-fill',
        type: 'fill',
        source: 'nyc-land',
        paint: {
          'fill-color': '#eeeeee', // light gray NYC land
          'fill-opacity': 1
        }
      });

      // --- 3. Union Water and Add Layer ---
      let unitedWater: Feature<Polygon | MultiPolygon> | null = null;
      if (nycWater.features.length > 1) {
        unitedWater = nycWater.features.reduce((acc, feat) => {
          return acc ? union(acc, feat as Feature<Polygon | MultiPolygon>)! : (feat as Feature<Polygon | MultiPolygon>);
        }, null as Feature<Polygon | MultiPolygon> | null);
      } else {
        unitedWater = nycWater.features[0] as Feature<Polygon | MultiPolygon>;
      }

      map.addSource('nyc-water', {
        type: 'geojson',
        data: unitedWater as Feature<Polygon | MultiPolygon>
      });
      map.addLayer({
        id: 'nyc-water-fill',
        type: 'fill',
        source: 'nyc-water',
        paint: {
          'fill-color': '#4da6ff', // blue
          'fill-opacity': 0.9
        }
      });

      // --- 4. Convert Roads to Polygons & Add Layer ---
      const roadPolygons: FeatureCollection<Polygon> = {
        type: 'FeatureCollection',
        features: roads.features
          .map(line => {
            try {
              const poly = buffer(line as Feature<LineString>, 5, { units: 'meters' }); // widen road
              return poly as Feature<Polygon>;
            } catch {
              return null;
            }
          })
          .filter((f): f is Feature<Polygon> => f !== null)
      };

      map.addSource('roads', {
        type: 'geojson',
        data: roadPolygons
      });
      map.addLayer({
        id: 'roads-fill',
        type: 'fill',
        source: 'roads',
        paint: {
          'fill-color': '#888888', // gray roads
          'fill-opacity': 0.8
        }
      });
    });

    return () => {
      map.remove();
    };
  }, [nycLand, nycWater, roads]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
