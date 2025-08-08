import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
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
      mapInstance = new maplibregl.Map({
        container: mapRef.current!,
        style: {
          version: 8,
          name: "Custom Inline Style",
          sources: {
            // Base vector tile source for streets, buildings, etc.
            osm: {
              type: "vector",
              tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf"
              ],
              minzoom: 0,
              maxzoom: 14
            }
          },
          layers: [
            // Background
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#f0f0f0" }
            },
            // Water
            {
              id: "water",
              type: "fill",
              source: "osm",
              "source-layer": "water",
              paint: { "fill-color": "#64B5F6" }
            },
            // Parks
            {
              id: "parks",
              type: "fill",
              source: "osm",
              "source-layer": "landuse",
              filter: ["==", "class", "park"],
              paint: { "fill-color": "#81C784" }
            },
            // Roads
            {
              id: "roads",
              type: "line",
              source: "osm",
              "source-layer": "transportation",
              paint: {
                "line-color": "#ffffff",
                "line-width": 1.5
              }
            },
            // Road outlines
            {
              id: "road-outline",
              type: "line",
              source: "osm",
              "source-layer": "transportation",
              paint: {
                "line-color": "#999999",
                "line-width": 2
              }
            },
            // Labels
            {
              id: "place-labels",
              type: "symbol",
              source: "osm",
              "source-layer": "place",
              layout: {
                "text-field": ["get", "name"],
                "text-size": 12
              },
              paint: {
                "text-color": "#333333",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1
              }
            }
          ]
        },
        center: [-73.9712, 40.7831],
        zoom: 10,
        attributionControl: false,
        maxBounds: [
          [-74.5, 40.477],
          [-73.5, 40.917]
        ]
      });

      mapInstance.on('load', async () => {
        if (cleanedUp) return;

        const geoData = await loadGeoJSONData();
        if (!geoData || !mapInstance) return;

        mapInstance.addSource('geojson-data', {
          type: 'geojson',
          data: geoData
        });

        // NYC land polygons
        mapInstance.addLayer({
          id: 'nyc-land',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['!=', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#f0f0f0',
            'fill-opacity': 1
          }
        });

        // Custom water override
        mapInstance.addLayer({
          id: 'custom-water',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['==', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#64B5F6',
            'fill-opacity': 1
          }
        });

        // Parks override
        mapInstance.addLayer({
          id: 'custom-parks',
          type: 'fill',
          source: 'geojson-data',
          filter: [
            'all',
            ['==', ['geometry-type'], 'Polygon'],
            ['==', ['get', 'leisure'], 'park']
          ],
          paint: {
            'fill-color': '#81C784',
            'fill-opacity': 0.8
          }
        });

        setMap(mapInstance);
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
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#f0f0f0'
      }}
    />
  );
};

export default MapLibreMap;
