import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, Feature } from 'geojson';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  onMapLoad?: (map: maplibregl.Map) => void;
  businesses?: Array<{
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
  }>;
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: { position: { lat: number; lng: number } } | null;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ 
  onMapLoad, 
  businesses = [], 
  onBusinessClick, 
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<maplibregl.Marker[]>([]);
  const clusterRef = useRef<Supercluster | null>(null);

  // Load GeoJSON file
  const loadGeoJSONData = useCallback(async (): Promise<any> => {
    try {
      console.log('Loading GeoJSON data from example-points.geojson...');
      
      const response = await fetch('/data/example-points.geojson');
      
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      
      const data = await response.json();
      console.log(`Loaded ${data.features?.length || 0} features from example-points.geojson`);
      
      return data;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;
    
    console.log('Initializing map...');
    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initializeMap = async () => {
      try {
        // Create basic map
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
          center: [-73.9712, 40.7831],
          zoom: 14
        });

        mapInstance.on('load', async () => {
          console.log('Map loaded, adding GeoJSON data...');
          
          // Load GeoJSON data
          const geoData = await loadGeoJSONData();
          
          if (isCleanedUp || !geoData?.features) {
            return;
          }

          // Add GeoJSON source
          mapInstance!.addSource('geojson-data', {
            type: 'geojson',
            data: geoData
          });
          mapInstance.addLayer({
            id: 'polygons',
            type: 'fill',
            source: 'geojson-data',
            filter: ['in', '$type', 'Polygon', 'MultiPolygon'],
            paint: {
              'fill-color': '#AEDFF7',
              'fill-opacity': 0.6
            }
          });

          mapInstance.addLayer({
            id: 'polygon-outline',
            type: 'line',
            source: 'geojson-data',
            filter: ['in', '$type', 'Polygon', 'MultiPolygon'],
            paint: {
              'line-color': '#4A90E2',
              'line-width': 1
            }
          });

          
          // Add roads after (to render on top)
          mapInstance.addLayer({
            id: 'roads',
            type: 'line',
            source: 'geojson-data',
            filter: ['==', '$type', 'LineString'],
            paint: {
              'line-color': '#888888',
              'line-width': 1.5
            }
          });

          console.log('All GeoJSON layers added successfully!');
          
          if (!isCleanedUp) {
            setMap(mapInstance);
            onMapLoad?.(mapInstance);
          }
        });

        mapInstance.on('error', (e) => {
          console.error('Map error:', e);
        });

      } catch (error) {
        console.error('Error during map initialization:', error);
      }
    };

    initializeMap();

    return () => {
      console.log('Cleaning up map...');
      isCleanedUp = true;
      
      try {
        if (mapInstance && mapInstance.getContainer()) {
          mapInstance.remove();
        }
      } catch (error) {
        console.warn('Error cleaning up map:', error);
      }
      mapInstance = null;
      setMap(null);
    };
  }, [loadGeoJSONData, onMapLoad]);

  // Handle business markers
  useEffect(() => {
    if (!map || !businesses.length) return;

    // Clear existing markers
    markers.forEach(marker => marker.remove());

    // Create new markers
    const newMarkers = businesses.map(business => {
      const el = document.createElement('div');
      el.style.cssText = `
        background: #FFEB3B;
        border: 2px solid #FFC107;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      `;
      
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([business.position.lng, business.position.lat])
        .addTo(map);

      el.addEventListener('click', () => {
        onBusinessClick?.(business);
      });

      return marker;
    });

    setMarkers(newMarkers);

    return () => {
      newMarkers.forEach(marker => marker.remove());
    };
  }, [map, businesses, onBusinessClick]);

  // Center map on selected business
  useEffect(() => {
    if (!map || !selectedBusiness?.position) return;
    
    map.easeTo({
      center: [selectedBusiness.position.lng, selectedBusiness.position.lat],
      zoom: 16
    });
  }, [map, selectedBusiness]);

  return (
    <div 
      ref={mapRef} 
      className="absolute inset-0 w-full h-full"
      style={{ backgroundColor: '#f0f0f0' }}
    />
  );
};

export default MapLibreMap;