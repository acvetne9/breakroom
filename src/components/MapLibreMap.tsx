import React, { useRef, useEffect } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  geojsonData: GeoJSON.FeatureCollection;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ geojsonData }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const baseStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#9E9E9E' }
        }
      ]
    };

    const mapInstance = new maplibregl.Map({
      container: mapContainerRef.current,
      style: baseStyle,
      center: [-74.006, 40.7128],
      zoom: 10
    });

    mapRef.current = mapInstance;

    mapInstance.on('load', async () => {
      // Step 1: Fetch coastline + water polygons from Overpass API
      const overpassQuery = `
        [out:json][timeout:60];
        (
          way["natural"="coastline"](40.48,-74.30,40.93,-73.68);
          relation["natural"="water"](40.48,-74.30,40.93,-73.68);
          relation["waterway"="riverbank"](40.48,-74.30,40.93,-73.68);
        );
        out geom;
      `;
      const overpassUrl = "https://overpass-api.de/api/interpreter";
      let osmFeatures: GeoJSON.Feature[] = [];

      try {
        const resp = await fetch(overpassUrl, {
          method: "POST",
          body: overpassQuery
        });
        const data = await resp.json();

        osmFeatures = data.elements
          .filter((el: any) => el.type === "way" || el.type === "relation")
          .map((el: any) => {
            if (!el.geometry) return null;
            const coords = el.geometry.map((g: any) => [g.lon, g.lat]);
            return {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [coords]
              },
              properties: {}
            } as GeoJSON.Feature;
          })
          .filter(Boolean) as GeoJSON.Feature[];
      } catch (err) {
        console.error("Overpass fetch failed", err);
      }

      // Step 2: Merge user data + OSM water/coast polygons
      const mergedData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...geojsonData.features, ...osmFeatures]
      };

      // Step 3: Add to map
      mapInstance.addSource('merged-data', {
        type: 'geojson',
        data: mergedData
      });

      mapInstance.addLayer({
        id: 'land-and-water',
        type: 'fill',
        source: 'merged-data',
        filter: [
          'in',
          ['geometry-type'],
          ['literal', ['Polygon', 'MultiPolygon']]
        ],
        paint: {
          'fill-color': '#9E9E9E',
          'fill-opacity': 1
        }
      });

      mapInstance.addLayer({
        id: 'road-lines',
        type: 'line',
        source: 'merged-data',
        filter: [
          'in',
          ['geometry-type'],
          ['literal', ['LineString', 'MultiLineString']]
        ],
        paint: {
          'line-color': '#000',
          'line-width': 1
        }
      });
    });

    return () => {
      mapInstance.remove();
    };
  }, [geojsonData]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default MapLibreMap;
