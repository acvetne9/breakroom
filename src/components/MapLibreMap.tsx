import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: any[];
  onBusinessClick: (business: any) => void;
  selectedBusiness: any;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ businesses, onBusinessClick, selectedBusiness }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGeoJSONData = useCallback(async (): Promise<FeatureCollection | null> => {
    try {
      console.log('Attempting to load GeoJSON...');
      const response = await fetch('/data/nyc.geojson');
      if (!response.ok) {
        throw new Error(`Failed to load GeoJSON: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log('GeoJSON loaded successfully:', data);
      return data;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      setError(`Failed to load map data: ${error}`);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) {
      console.error('Map container ref is null');
      return;
    }

    console.log('Initializing MapLibre GL JS...');
    
    let mapInstance: maplibregl.Map | null = null;
    let cleanedUp = false;

    const initializeMap = async () => {
      try {
        // Create a basic map first
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: {
            version: 8,
            name: "Basic NYC Map",
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#f8f8f8' }
              }
            ]
          },
          center: [-74.0, 40.7],
          zoom: 11,
          attributionControl: false
        });

        console.log('Map instance created');

        mapInstance.on('load', async () => {
          if (cleanedUp) return;
          
          console.log('Map loaded, adding data...');

          // Try to load and add GeoJSON data
          const geoData = await loadGeoJSONData();
          
          if (geoData && mapInstance) {
            console.log('Adding GeoJSON source with', geoData.features?.length, 'features');
            
            mapInstance.addSource('nyc-data', {
              type: 'geojson',
              data: geoData
            });

            // Add a simple layer for all polygons first
            mapInstance.addLayer({
              id: 'all-polygons',
              type: 'fill',
              source: 'nyc-data',
              filter: ['==', ['geometry-type'], 'Polygon'],
              paint: {
                'fill-color': [
                  'case',
                  ['==', ['get', 'natural'], 'water'], '#64B5F6',
                  ['any', ['==', ['get', 'leisure'], 'park'], ['==', ['get', 'landuse'], 'recreation_ground']], '#81C784',
                  '#e0e0e0'
                ],
                'fill-opacity': 0.7,
                'fill-outline-color': '#666666'
              }
            });

            // Add simple lines for roads
            mapInstance.addLayer({
              id: 'all-lines',
              type: 'line',
              source: 'nyc-data',
              filter: ['==', ['geometry-type'], 'LineString'],
              paint: {
                'line-color': '#ffffff',
                'line-width': 1.5,
                'line-opacity': 0.8
              }
            });

            console.log('Layers added successfully');
            
            // Fit map to data bounds if possible
            try {
              const bounds = new maplibregl.LngLatBounds();
              geoData.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                  feature.geometry.coordinates[0].forEach(coord => {
                    bounds.extend([coord[0], coord[1]]);
                  });
                }
              });
              mapInstance.fitBounds(bounds, { padding: 20 });
            } catch (boundsError) {
              console.warn('Could not fit bounds:', boundsError);
            }
          } else {
            console.warn('No GeoJSON data available, showing empty map');
          }

          setMap(mapInstance);
        });

        mapInstance.on('error', (e) => {
          console.error('MapLibre error:', e.error);
          setError(`Map error: ${e.error?.message || 'Unknown error'}`);
        });

        mapInstance.on('sourcedata', (e) => {
          if (e.sourceId === 'nyc-data') {
            console.log('Source data event:', e.dataType, 'loaded:', e.isSourceLoaded);
          }
        });

      } catch (error) {
        console.error('Error initializing map:', error);
        setError(`Map initialization failed: ${error}`);
      }
    };

    initializeMap();

    return () => {
      console.log('Cleaning up map...');
      cleanedUp = true;
      if (mapInstance) {
        mapInstance.remove();
      }
      setMap(null);
    };
  }, [loadGeoJSONData]);

  if (error) {
    return (
      <div style={{ 
        position: 'absolute', 
        top: 0, 
        bottom: 0, 
        left: 0, 
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        color: '#d32f2f',
        padding: '20px',
        fontSize: '14px'
      }}>
        <div>
          <strong>Map Error:</strong><br />
          {error}
          <br /><br />
          <small>Check the browser console for more details.</small>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={mapRef}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      />
      {/* Loading indicator */}
      {!map && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '20px',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          Loading map...
        </div>
      )}
    </>
  );
};

export default MapLibreMap;