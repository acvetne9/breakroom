import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

import nycRawData from './nyc.json'; // Load your raw LineString GeoJSON

const MapLibreMap: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    // Step 1: Buffer LineString roads into polygons
    const lineFeatures = nycRawData.features.filter(
      (f) =>
        f.geometry.type === 'LineString' ||
        f.geometry.type === 'MultiLineString'
    );

    const bufferedFeatures = lineFeatures.map((f) =>
      turf.buffer(f as turf.Feature<turf.LineString | turf.MultiLineString>, 6, {
        units: 'meters',
      })
    );

    const bufferedCollection = {
      type: 'FeatureCollection',
      features: bufferedFeatures.map((b) => turf.flatten(b).features).flat(),
    };

    // Step 2: Initialize the map
    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          },
          road-polygons: {
            type: 'geojson',
            data: bufferedCollection,
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
          },
          {
            id: 'gray-road-fills',
            type: 'fill',
            source: 'road-polygons',
            paint: {
              'fill-color': '#808080',
              'fill-opacity': 1.0,
            },
          }
        ],
      },
      center: [-73.9857, 40.7484], // NYC center
      zoom: 12,
    });

    mapRef.current = map;
  }, []);

  return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
};

export default MapLibreMap;
