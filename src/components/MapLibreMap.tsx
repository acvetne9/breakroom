import React, { useEffect, useRef, useState, useCallback } from 'react';
import type {
  FeatureCollection,
  Feature,
  Polygon,
  MultiPolygon,
  LineString
} from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (businessId: string) => void;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [landData, setLandData] = useState<FeatureCollection | null>(null);
  const [waterData, setWaterData] = useState<FeatureCollection | null>(null);
  const [roadData, setRoadData] = useState<FeatureCollection | null>(null);

  const loadGeoJSONData = async (): Promise<FeatureCollection | null> => {
    try {
      const res = await fetch('/data/nyc.geojson');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as FeatureCollection;
    } catch (err) {
      console.error('Error loading GeoJSON:', err);
      return null;
    }
  };

  const processData = useCallback(async () => {
    const mainData = await loadGeoJSONData();
    if (!mainData) return;

    const landFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const waterFeatures: Feature<Polygon | MultiPolygon>[] = [];
    const roadFeatures: Feature<Polygon | MultiPolygon | LineString>[] = [];

    mainData.features.forEach((feature) => {
      const props = feature.properties || {};
      const geomType = feature.geometry?.type;

      // Land
      if (
        props.natural === 'land' ||
        props.leisure === 'park' ||
        props.landuse
      ) {
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          landFeatures.push(feature as Feature<Polygon | MultiPolygon>);
        }
      }

      // Water
      if (props.natural === 'water' || props.water) {
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          waterFeatures.push(feature as Feature<Polygon | MultiPolygon>);
        }
      }

      // Roads / bridges / tunnels
      if (props.highway || props.bridge || props.tunnel) {
        if (
          geomType === 'Polygon' ||
          geomType === 'MultiPolygon' ||
          geomType === 'LineString'
        ) {
          roadFeatures.push(
            feature as Feature<Polygon | MultiPolygon | LineString>
          );
        }
      }
    });

    // ✅ Fallback water coverage if no polygons found
    if (!waterFeatures.length) {
      console.warn('No water features found — adding fallback water polygon');

      const bbox: [number, number, number, number] = [
        -74.3, 40.5, -73.7, 40.93
      ];
      let fallbackWater = turf.bboxPolygon(bbox);

      // Subtract any existing land polygons so they don't get colored as water
      if (landFeatures.length) {
        landFeatures.forEach((land) => {
          try {
            const diff = turf.difference(fallbackWater, land);
            if (diff) fallbackWater = diff;
          } catch (err) {
            console.warn('Could not subtract land from fallback water:', err);
          }
        });
      }

      fallbackWater.properties = {
        natural: 'water',
        source: 'fallback'
      };
      waterFeatures.push(fallbackWater as Feature<Polygon | MultiPolygon>);
    }

    setLandData(turf.featureCollection(landFeatures));
    setWaterData(turf.featureCollection(waterFeatures));
    setRoadData(turf.featureCollection(roadFeatures));
  }, []);

  useEffect(() => {
    processData();
  }, [processData]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: [-74, 40.7],
      zoom: 11
    });

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Add/update sources & layers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addOrUpdateSource = (id: string, data: FeatureCollection) => {
      if (map.getSource(id)) {
        (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);
      } else {
        map.addSource(id, { type: 'geojson', data });
      }
    };

    map.on('load', () => {
      if (landData) {
        addOrUpdateSource('land-data', landData);
        map.addLayer({
          id: 'land-layer',
          type: 'fill',
          source: 'land-data',
          paint: { 'fill-color': '#e0e0e0', 'fill-opacity': 1 }
        });
      }

      if (waterData) {
        addOrUpdateSource('water-data', waterData);
        map.addLayer({
          id: 'water-layer',
          type: 'fill',
          source: 'water-data',
          paint: { 'fill-color': '#87ceeb', 'fill-opacity': 1 }
        });
      }

      if (roadData) {
        addOrUpdateSource('road-data', roadData);
        map.addLayer({
          id: 'road-layer',
          type: 'line',
          source: 'road-data',
          paint: { 'line-color': '#aaaaaa', 'line-width': 2 }
        });
      }
    });
  }, [landData, waterData, roadData]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
