
import React, { useEffect, useRef } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

const MAP_ID = 'map-container';

const fetchMergedRoadsGeoJSON = async (): Promise<FeatureCollection<Polygon>> => {
  const response = await fetch('/merged_roads.geojson.gz');
  const buffer = await response.arrayBuffer();

  const decompressedText = new TextDecoder('utf-8').decode(
    typeof CompressionStream !== 'undefined'
      ? await (async () => {
          const ds = new DecompressionStream('gzip');
          const decompressedStream = new Response(
            buffer.stream().pipeThrough(ds)
          ).body;
          return await new Response(decompressedStream).text();
        })()
      : pako.ungzip(new Uint8Array(buffer), { to: 'string' })
  );

  const geojson = JSON.parse(decompressedText);

  // Buffer each MultiLineString into a Polygon
  const bufferedFeatures: Feature<Polygon>[] = geojson.features
    .filter((f: any) => f.geometry?.type === 'MultiLineString')
    .map((feature: any) => {
      try {
        const buffered = turf.buffer(feature, 5, { units: 'meters' });
        if (buffered.geometry.type === 'Polygon') {
          buffered.properties = {
            name: feature.properties?.name || '',
          };
          return buffered as Feature<Polygon>;
        }
      } catch (err) {
        console.warn('Buffer failed for feature:', err);
        return null;
      }
    })
    .filter((f): f is Feature<Polygon> => f !== null);

  return {
    type: 'FeatureCollection',
    features: bufferedFeatures
  };
};

const MapLibreMap: React.FC = () => {
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    const initializeMap = async () => {
      const geojsonData = await fetchMergedRoadsGeoJSON();

      const map = new maplibregl.Map({
        container: MAP_ID,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-73.98, 40.73],
        zoom: 11
      });

      mapRef.current = map;

      map.on('load', () => {
        map.addSource('merged-roads', {
          type: 'geojson',
          data: geojsonData
        });

        map.addLayer({
          id: 'merged-road-polygons',
          type: 'fill',
          source: 'merged-roads',
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint: {
            'fill-color': '#777777',
            'fill-opacity': 0.9
          }
        });
      });
    };

    initializeMap();
  }, []);

  return <div id={MAP_ID} style={{ width: '100%', height: '100vh' }} />;
};

export default MapLibreMap;
