import React, { useEffect, useRef, useState } from 'react';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  geojsonData?: FeatureCollection;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ geojsonData }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Utility: always return a FeatureCollection
  const toFeatureCollection = (
    input: FeatureCollection | Feature
  ): FeatureCollection => {
    if (!input) return turf.featureCollection([]);
    if (input.type === 'FeatureCollection') return input;
    return turf.featureCollection([input]);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center: [-74.006, 40.7128],
      zoom: 11,
    });

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !geojsonData || !geojsonData.features) return;
    const map = mapRef.current;
    if (!map) return;

    // Process line features into polygons
    const lineFeatures = geojsonData.features.filter(
      f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
    );

    const bufferedPolygons: Feature<Polygon | MultiPolygon>[] = [];

    lineFeatures.forEach(line => {
      const buffered = turf.buffer(line as Feature<LineString>, 5, { units: 'meters' });
      const fc = toFeatureCollection(buffered);
      fc.features.forEach(f => {
        if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
          bufferedPolygons.push(f as Feature<Polygon | MultiPolygon>);
        }
      });
    });

    const polygonFC = turf.featureCollection(bufferedPolygons);

    if (!map.getSource('roads-polygons')) {
      map.addSource('roads-polygons', {
        type: 'geojson',
        data: polygonFC,
      });

      map.addLayer({
        id: 'roads-fill',
        type: 'fill',
        source: 'roads-polygons',
        paint: {
          'fill-color': '#bbbbbb',
          'fill-opacity': 0.8,
        },
      });
    } else {
      const source = map.getSource('roads-polygons') as maplibregl.GeoJSONSource;
      source.setData(polygonFC);
    }
  }, [mapLoaded, geojsonData]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
