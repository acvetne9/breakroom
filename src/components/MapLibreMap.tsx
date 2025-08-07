import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  onMapLoad?: (map: maplibregl.Map) => void;
  businesses?: Array<{
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
    businessType?: string;
    roles?: Array<{ 
      role: string; 
      salary: string; 
      upvotes?: number; 
      downvotes?: number; 
      userVote?: 'up' | 'down' | null; 
    }>;
    place_id?: string;
    website?: string;
    url?: string;
  }>;
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ onMapLoad, businesses = [], onBusinessClick, selectedBusiness }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  // Load GeoJSON file
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
      try {
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: {
                  'background-color': '#f0f0f0'
                }
              }
            ]
          },
          center: [-73.9712, 40.7831], // NYC approx center
          zoom: 12
        });

        mapInstance.on('load', async () => {
          if (cleanedUp) return;

          const geoData = await loadGeoJSONData();
          if (!geoData) return;

          // Add GeoJSON source
          mapInstance!.addSource('geojson-data', {
            type: 'geojson',
            data: geoData
          });

          // Parks layer
          mapInstance!.addLayer({
            id: 'parks',
            type: 'fill',
            source: 'geojson-data',
            filter: ['all', ['==', '$type', 'Polygon'], ['==', ['get', 'leisure'], 'park']],
            paint: {
              'fill-color': '#81C784',
              'fill-opacity': 0.5
            }
          });

          // Water layer
          mapInstance!.addLayer({
            id: 'water',
            type: 'fill',
            source: 'geojson-data',
            filter: ['all', ['==', '$type', 'Polygon'], ['==', ['get', 'natural'], 'water']],
            paint: {
              'fill-color': '#64B5F6',
              'fill-opacity': 0.6
            }
          });

          // Roads layer (filter by highway property)
          mapInstance!.addLayer({
            id: 'roads',
            type: 'line',
            source: 'geojson-data',
            filter: ['all', ['==', '$type', 'LineString'], ['has', 'highway']],
            paint: {
              'line-color': '#888888',
              'line-width': 1.5
            }
          });

          // Optional: Debug all polygons (uncomment to see all polygons)
          /*
          mapInstance!.addLayer({
            id: 'debug-polygons',
            type: 'fill',
            source: 'geojson-data',
            filter: ['==', '$type', 'Polygon'],
            paint: {
              'fill-color': '#e91e63',
              'fill-opacity': 0.2,
              'fill-outline-color': '#000000'
            }
          });
          */

          // Fit map to bounds of all features with padding
          const bbox = turf.bbox(geoData);
          mapInstance!.fitBounds(bbox as [number, number, number, number], {
            padding: 100,
            linear: true,
            duration: 1500,
          });

          setMap(mapInstance);
          onMapLoad?.(mapInstance);
        });

        mapInstance.on('error', e => {
          console.error('Map error:', e.error);
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    initializeMap();

    return () => {
      cleanedUp = true;
      if (mapInstance) {
        mapInstance.remove();
      }
      setMap(null);
    };
  }, [loadGeoJSONData, onMapLoad]);

  return (
    <div
      ref={mapRef}
      className="absolute inset-0 w-full h-full"
      style={{ backgroundColor: '#f0f0f0' }}
    />
  );
};

export default MapLibreMap;
