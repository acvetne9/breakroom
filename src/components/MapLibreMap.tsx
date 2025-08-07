import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, Feature } from 'geojson';
import { bbox } from '@turf/turf';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
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
  }>;
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: { position: { lat: number; lng: number } } | null;
}

// Enhanced road processing function that buffers line geometries into polygons

// Enhanced road processing function that buffers ALL line geometries
const processRoadGeometry = (geojsonData: any): FeatureCollection<Polygon> => {
  console.log('Processing road geometry - buffering all lines into gray polygons...');
  
  if (!geojsonData?.features) {
    console.warn('No features found in GeoJSON data');
    return { type: 'FeatureCollection', features: [] };
  }

  const bufferedFeatures: Feature<Polygon>[] = [];
  
  geojsonData.features.forEach((feature: any, index: number) => {
    try {
      const geomType = feature.geometry?.type;
      
      // Process LineString and MultiLineString geometries
      if (geomType === 'LineString' || geomType === 'MultiLineString') {
        console.log(`Buffering ${geomType} feature ${index}`);
        
        // Determine buffer width based on road type (if available)
        const highway = feature.properties?.highway;
        let bufferWidth = 3; // Default width in meters
        
        switch (highway) {
          case 'motorway':
          case 'trunk':
            bufferWidth = 8;
            break;
          case 'primary':
            bufferWidth = 6;
            break;
          case 'secondary':
            bufferWidth = 5;
            break;
          case 'tertiary':
            bufferWidth = 4;
            break;
          case 'residential':
          case 'service':
            bufferWidth = 3;
            break;
          case 'footway':
          case 'path':
            bufferWidth = 1.5;
            break;
          default:
            bufferWidth = 3;
        }
        
        const buffered = turf.buffer(feature, bufferWidth, { units: 'meters' });
        
        if (buffered && buffered.geometry) {
          // Handle both Polygon and MultiPolygon results from buffer
          if (buffered.geometry.type === 'Polygon') {
            bufferedFeatures.push({
              type: 'Feature',
              geometry: buffered.geometry as Polygon,
              properties: {
                name: feature.properties?.name || '',
                highway: feature.properties?.highway || '',
                original_type: geomType,
                buffered: true
              }
            });
          } else if (buffered.geometry.type === 'MultiPolygon') {
            // Convert MultiPolygon to multiple Polygon features
            buffered.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
              bufferedFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: polygonCoords
                },
                properties: {
                  name: feature.properties?.name || '',
                  highway: feature.properties?.highway || '',
                  original_type: geomType,
                  buffered: true,
                  multi_part: polyIndex
                }
              });
            });
          }
        }
      }
      // Also include existing polygon features if any
      else if (geomType === 'Polygon') {
        console.log(`Including existing polygon feature ${index}`);
        bufferedFeatures.push({
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            original_type: geomType,
            buffered: false
          }
        });
      }
      else if (geomType === 'MultiPolygon') {
        console.log(`Converting MultiPolygon feature ${index} to individual polygons`);
        feature.geometry.coordinates.forEach((polygonCoords: any, polyIndex: number) => {
          bufferedFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: polygonCoords
            },
            properties: {
              ...feature.properties,
              original_type: geomType,
              buffered: false,
              multi_part: polyIndex
            }
          });
        });
      }
      
    } catch (err) {
      console.warn(`Buffer failed for feature ${index}:`, err);
    }
  });

  console.log(`Processed ${geojsonData.features.length} input features into ${bufferedFeatures.length} polygon features`);
  
  return {
    type: 'FeatureCollection',
    features: bufferedFeatures
  };
};

const MapLibreMap: React.FC<MapLibreMapProps> = ({ 
  onMapLoad, 
  businesses = [], 
  onBusinessClick, 
  selectedBusiness
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<maplibregl.Marker[]>([]);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const clusterRef = useRef<Supercluster | null>(null);
  
  const MARKER_VISIBILITY_ZOOM_THRESHOLD = 13;

  // Optimized function to load GeoJSON data
  const loadGeoJSONData = useCallback(async (): Promise<any> => {
    try {
      console.log('Loading GeoJSON data...');
      
      const response = await fetch('/data/merged_roads.geojson.gz', {
        headers: {
          'Accept': 'application/json, application/gzip, */*'
        }
      });
      
      if (!response.ok) {
        console.error('Failed to load GeoJSON:', response.statusText);
        return null;
      }
      
      // Simple decompression for .gz files
      const text = await response.text();
      
      // Check if it's already JSON
      if (text.trim().startsWith('{')) {
        return JSON.parse(text);
      }
      
      // Handle gzipped content
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b && 'DecompressionStream' in window) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        });
        
        const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
        const decompressedResponse = new Response(decompressedStream);
        const decompressedText = await decompressedResponse.text();
        return JSON.parse(decompressedText);
      }
      
      return null;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return null;
    }
  }, []);

  // Handle zoom change - removed as it was causing re-renders

  // Initialize map with merged roads GeoJSON data
  useEffect(() => {
    if (!mapRef.current) return;
    
    console.log('MapLibre: Initializing map with buffered roads...');
    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initializeMap = async () => {
      try {
        console.log('=== MAP INITIALIZATION START ===');
        
        // Create a basic map first
        console.log('Creating basic OSM map first...');
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: {
            version: 8,
            sources: {
              'osm': {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors'
              }
            },
            layers: [
              {
                id: 'osm-tiles',
                type: 'raster',
                source: 'osm'
              }
            ]
          },
          center: [-73.9712, 40.7831],
          zoom: 14,
          maxBounds: [
            [-74.2557, 40.4960],
            [-73.7004, 40.9152]
          ]
        });

        console.log('Basic map created, waiting for load...');

        mapInstance.on('load', async () => {
          console.log('Basic map loaded successfully!');
          
          try {
            // Load and process roads GeoJSON data immediately
            console.log('Loading and processing roads GeoJSON data...');
            const geojsonData = await loadGeoJSONData();
            
            if (isCleanedUp) {
              console.log('MapLibre: Initialization cancelled due to cleanup');
              return;
            }
            
            if (!geojsonData) {
              console.warn('No GeoJSON data available, keeping basic OSM map');
              if (!isCleanedUp) {
                setMap(mapInstance);
                onMapLoad?.(mapInstance);
              }
              return;
            }

            // Process the data for buffering
            const bufferedRoadsData = processRoadGeometry(geojsonData);
            
            if (!bufferedRoadsData.features.length) {
              console.warn('No processed road features available');
              if (!isCleanedUp) {
                setMap(mapInstance);
                onMapLoad?.(mapInstance);
              }
              return;
            }

            console.log(`Adding ${bufferedRoadsData.features.length} buffered road features to map...`);

            // Add the buffered roads GeoJSON as a source
            mapInstance!.addSource('buffered-roads', {
              type: 'geojson',
              data: bufferedRoadsData
            });

            // Add the main gray road polygons layer
            mapInstance!.addLayer({
              id: 'buffered-roads-fill',
              type: 'fill',
              source: 'buffered-roads',
              paint: {
                'fill-color': '#777777',
                'fill-opacity': 1.0
              }
            });

            // Add road outlines for better definition
            mapInstance!.addLayer({
              id: 'buffered-roads-outline',
              type: 'line',
              source: 'buffered-roads',
              paint: {
                'line-color': '#444444',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10, 0.5,
                  15, 1.0,
                  18, 1.5
                ],
                'line-opacity': 0.8
              }
            });

            console.log('Road layers added successfully!');

          } catch (dataError) {
            console.error('Error adding buffered roads data to map:', dataError);
          }
          
          if (!isCleanedUp) {
            setMap(mapInstance);
            onMapLoad?.(mapInstance);
          }
        });

        // Add zoom change listener
        const zoomHandler = () => {
          if (mapInstance) {
            const zoom = mapInstance.getZoom();
            setCurrentZoom(zoom);
          }
        };
        mapInstance.on('zoom', zoomHandler);

        // Error handling
        mapInstance.on('error', (e) => {
          console.error('MapLibre: Map error:', e);
        });

        console.log('MapLibre: Map instance created, waiting for load event');

      } catch (error) {
        console.error('MapLibre: Error during initialization:', error);
      }
    };

    initializeMap();

    return () => {
      console.log('MapLibre: Cleanup function called');
      isCleanedUp = true;
      
      // Cleanup function
      try {
        if (mapInstance && mapInstance.getContainer()) {
          console.log('MapLibre: Removing map instance');
          mapInstance.remove();
        }
      } catch (error) {
        console.warn('MapLibre: Error cleaning up map:', error);
      }
      mapInstance = null;
      setMap(null);
    };
  }, []); // No dependencies needed since we load from local file

  // Create marker clustering
  useEffect(() => {
    if (!map || !businesses.length) return;

    // Clear existing markers
    markers.forEach(marker => marker.remove());

    // Prepare data for clustering
    const points = businesses.map(business => ({
      type: 'Feature' as const,
      properties: {
        cluster: false,
        business
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [business.position.lng, business.position.lat]
      }
    }));

    // Initialize supercluster
    const cluster = new Supercluster({
      radius: 80,
      maxZoom: 12
    });

    cluster.load(points);
    clusterRef.current = cluster;

    // Get clusters for current view
    const bounds = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    
    const clusters = cluster.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );

    const newMarkers: maplibregl.Marker[] = [];

    clusters.forEach(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      
      if (cluster.properties.cluster) {
        // Could add cluster markers here if needed
      } else {
        // Create individual business marker
        const el = document.createElement('div');
        el.className = 'business-marker';
        el.style.cssText = `
          background: #FFEB3B;
          border: 2px solid #FFC107;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          z-index: 1000;
        `;
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        // Add click handler
        el.addEventListener('click', () => {
          onBusinessClick?.(cluster.properties.business);
        });

        newMarkers.push(marker);
      }
    });

    setMarkers(newMarkers);

    // Update markers on map move
    const updateMarkers = () => {
      // Clear existing markers
      newMarkers.forEach(marker => marker.remove());
      
      // Get new clusters
      const bounds = map.getBounds();
      const zoom = Math.floor(map.getZoom());
      
      const clusters = cluster.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      );

      const updatedMarkers: maplibregl.Marker[] = [];

      clusters.forEach(cluster => {
        const [lng, lat] = cluster.geometry.coordinates;
        
        if (!cluster.properties.cluster) {
          const el = document.createElement('div');
          el.className = 'business-marker';
          el.style.cssText = `
            background: #FFEB3B;
            border: 2px solid #FFC107;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            z-index: 1000;
          `;
          
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

          el.addEventListener('click', () => {
            onBusinessClick?.(cluster.properties.business);
          });

          updatedMarkers.push(marker);
        }
      });

      setMarkers(updatedMarkers);
    };

    map.on('moveend', updateMarkers);
    map.on('zoomend', updateMarkers);

    return () => {
      map.off('moveend', updateMarkers);
      map.off('zoomend', updateMarkers);
      newMarkers.forEach(marker => marker.remove());
    };
  }, [map, businesses, onBusinessClick, currentZoom]);

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
      style={{ 
        zIndex: 1,
      }}
    />
  );
};

export default MapLibreMap;