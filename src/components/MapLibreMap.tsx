import React, { useEffect, useRef } from 'react';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: { id: string; text: string; author: string }[];
    businessType?: string;
    roles?: { role: string; salary: string; upvotes?: number; downvotes?: number; userVote?: 'up' | 'down' }[];
  }[];
  onBusinessClick: (businessId: string) => void;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses, onBusinessClick }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: [-74.006, 40.7128],
      zoom: 12
    });

    mapRef.current = map;

    // Load GeoJSON from Supabase or wherever your data comes from
    fetch('/data/nyc.geojson')
      .then(res => res.json())
      .then((geojson: FeatureCollection) => {
        // Convert roads/bridges/tunnels from LineString to Polygon
        const polygonFeatures: Feature<Polygon | MultiPolygon>[] = [];
        const lineFeatures: Feature<LineString>[] = [];

        geojson.features.forEach((feature) => {
          const highwayType = feature.properties?.highway;
          if (highwayType && ['primary', 'secondary', 'tertiary', 'trunk', 'motorway', 'bridge', 'tunnel'].includes(highwayType)) {
            if (feature.geometry.type === 'LineString') {
              const buffered = turf.buffer(feature, 3, { units: 'meters' });
              if (buffered.geometry.type === 'Polygon' || buffered.geometry.type === 'MultiPolygon') {
                polygonFeatures.push(buffered as Feature<Polygon | MultiPolygon>);
              }
            }
          } else if (feature.geometry.type === 'LineString') {
            lineFeatures.push(feature as Feature<LineString>);
          } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            polygonFeatures.push(feature as Feature<Polygon | MultiPolygon>);
          }
        });

        // Land areas layer (forced gray for all non-water polygons)
        const landAreas = {
          type: 'FeatureCollection',
          features: polygonFeatures
        };

        map.addSource('land-areas', { type: 'geojson', data: landAreas });

        map.addLayer({
          id: 'land-areas',
          type: 'fill',
          source: 'land-areas',
          paint: {
            'fill-color': [
              'case',
              ['has', 'water'], '#0000FF', // Blue for water
              '#D3D3D3' // Light gray for everything else
            ],
            'fill-opacity': 1
          }
        });

        // Road polygons
        const roadPolygons = {
          type: 'FeatureCollection',
          features: polygonFeatures.filter(f => f.properties?.highway)
        };
        map.addSource('road-polygons', { type: 'geojson', data: roadPolygons });
        map.addLayer({
          id: 'road-polygons',
          type: 'fill',
          source: 'road-polygons',
          paint: {
            'fill-color': '#A9A9A9',
            'fill-opacity': 0.8
          }
        });

        // Road lines
        const roadLines = {
          type: 'FeatureCollection',
          features: lineFeatures
        };
        map.addSource('road-lines', { type: 'geojson', data: roadLines });
        map.addLayer({
          id: 'road-lines',
          type: 'line',
          source: 'road-lines',
          paint: {
            'line-color': '#555',
            'line-width': 2
          }
        });

        // Business markers
        businesses.forEach((business) => {
          const el = document.createElement('div');
          el.className = 'marker';
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.backgroundColor = 'red';
          el.style.borderRadius = '50%';
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => onBusinessClick(business.id));

          new maplibregl.Marker(el)
            .setLngLat([business.position.lng, business.position.lat])
            .addTo(map);
        });
      });
  }, [businesses, onBusinessClick]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
};

export default MapLibreMap;
