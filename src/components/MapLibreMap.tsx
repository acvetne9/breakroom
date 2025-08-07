import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { FeatureCollection, Polygon, Feature } from 'geojson';
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
  supabaseUrl: string;
  supabaseKey: string;
}

function debugGeoJSONProperties(geojsonData: any) {
  console.log('=== COMPREHENSIVE GeoJSON Debug Info ===');
  
  if (geojsonData?.features) {
    console.log(`Total features: ${geojsonData.features.length}`);
    
    // Group by geometry type
    const geometryTypes = geojsonData.features.reduce((acc: any, f: any) => {
      const type = f.geometry.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Geometry type breakdown:', geometryTypes);
    
    // Sample features by type
    Object.keys(geometryTypes).forEach(geomType => {
      const featuresOfType = geojsonData.features.filter((f: any) => f.geometry.type === geomType);
      console.log(`\n--- ${geomType} Features (${featuresOfType.length} total) ---`);
      
      // Show first 3 features of each type
      featuresOfType.slice(0, 3).forEach((feature: any, index: number) => {
        console.log(`${geomType} Feature ${index}:`, {
          properties: feature.properties,
          propertyKeys: Object.keys(feature.properties || {}),
          hasCoordinates: !!feature.geometry.coordinates,
          coordinateLength: Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates.length : 0
        });
      });
      
      // Get all unique property keys for this geometry type
      const allProps = new Set();
      featuresOfType.forEach((f: any) => {
        if (f.properties) {
          Object.keys(f.properties).forEach(key => allProps.add(key));
        }
      });
      console.log(`All property keys for ${geomType}:`, Array.from(allProps));
      
      // Check for specific property values
      ['natural', 'leisure', 'landuse', 'highway', 'waterway', 'building', 'amenity', 'bridge', 'tunnel', 'man_made'].forEach(prop => {
        const withProp = featuresOfType.filter((f: any) => f.properties?.[prop]);
        if (withProp.length > 0) {
          const uniqueValues = [...new Set(withProp.map((f: any) => f.properties[prop]))];
          console.log(`  ${geomType} features with '${prop}': ${withProp.length}, values:`, uniqueValues.slice(0, 10));
        }
      });
    });
    
  } else {
    console.log('No features found in GeoJSON data');
  }
}

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
  selectedBusiness,
  supabaseUrl,
  supabaseKey
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [markers, setMarkers] = useState<maplibregl.Marker[]>([]);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const clusterRef = useRef<Supercluster | null>(null);
  
  const MARKER_VISIBILITY_ZOOM_THRESHOLD = 13;

  // Function to decompress gzipped content with better error handling
  const decompressGzip = async (response: Response): Promise<any> => {
    console.log('=== DECOMPRESSION DEBUG ===');
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response content-type:', response.headers.get('content-type'));
    console.log('Response content-encoding:', response.headers.get('content-encoding'));
    
    try {
      // First, let's try the simplest approach - direct JSON parse
      console.log('Attempting direct JSON parse...');
      const text = await response.text();
      console.log('Response text length:', text.length);
      console.log('First 200 characters:', text.substring(0, 200));
      
      // Check if it's already JSON (not gzipped)
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        console.log('Data appears to be uncompressed JSON');
        return JSON.parse(text);
      }
      
      // If we get here, it might be gzipped or binary
      console.log('Data does not appear to be plain JSON, might be compressed');
      
      // Try to decode as binary and look for gzip magic number
      const bytes = new Uint8Array(await response.arrayBuffer());
      console.log('Binary data length:', bytes.length);
      console.log('First 10 bytes:', Array.from(bytes.slice(0, 10)).map(b => b.toString(16)).join(' '));
      
      // Check for gzip magic number (1f 8b)
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        console.log('Detected gzip magic number');
        
        // Try browser decompression if available
        if ('DecompressionStream' in window) {
          console.log('Using browser native decompression...');
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            }
          });
          
          const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
          const decompressedResponse = new Response(decompressedStream);
          const decompressedText = await decompressedResponse.text();
          console.log('Decompressed text length:', decompressedText.length);
          console.log('First 200 chars of decompressed:', decompressedText.substring(0, 200));
          return JSON.parse(decompressedText);
        } else {
          console.error('Browser does not support DecompressionStream');
          throw new Error('Gzip decompression not supported in this browser');
        }
      } else {
        console.log('No gzip magic number found, trying direct parse of binary as text');
        const decoder = new TextDecoder();
        const decodedText = decoder.decode(bytes);
        console.log('Decoded text length:', decodedText.length);
        console.log('First 200 chars of decoded:', decodedText.substring(0, 200));
        return JSON.parse(decodedText);
      }
      
    } catch (error) {
      console.error('Comprehensive decompression failed:', error);
      throw error;
    }
  };

  // Function to fetch merged roads GeoJSON from Supabase with comprehensive debugging
  const fetchMergedRoadsGeoJSON = useCallback(async () => {
    try {
      console.log('=== FETCH DEBUG START ===');
      console.log('Supabase URL:', supabaseUrl);
      console.log('Supabase Key:', supabaseKey ? 'Present' : 'Missing');
      
      const fullUrl = `${supabaseUrl}/storage/v1/object/public/nyc-map-storage-files/merged_roads.geojson.gz`;
      console.log('Full fetch URL:', fullUrl);
      
      console.log('Starting fetch...');
      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json, application/gzip, */*',
          'Accept-Encoding': 'gzip, deflate'
        }
      });
      
      console.log('Fetch completed. Response status:', response.status);
      console.log('Response ok:', response.ok);
      console.log('Response statusText:', response.statusText);
      
      if (!response.ok) {
        console.error('Fetch failed with status:', response.status, response.statusText);
        
        // Try without the .gz extension as a fallback
        console.log('Trying without .gz extension...');
        const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/nyc-map-storage-files/merged_roads.geojson`;
        console.log('Fallback URL:', fallbackUrl);
        
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/json, */*'
          }
        });
        
        console.log('Fallback response status:', fallbackResponse.status);
        
        if (!fallbackResponse.ok) {
          throw new Error(`Both attempts failed. Original: ${response.statusText}, Fallback: ${fallbackResponse.statusText}`);
        }
        
        console.log('Fallback successful, parsing JSON...');
        const fallbackData = await fallbackResponse.json();
        console.log('Fallback data loaded successfully');
        debugGeoJSONProperties(fallbackData);
        return processRoadGeometry(fallbackData);
      }
      
      console.log('Main response successful, attempting decompression...');
      const geojsonData = await decompressGzip(response);
      
      console.log('Data loaded successfully, type:', typeof geojsonData);
      console.log('Data keys:', Object.keys(geojsonData || {}));
      
      if (!geojsonData) {
        console.error('Decompression returned null/undefined');
        return null;
      }
      
      console.log('Starting GeoJSON debug...');
      debugGeoJSONProperties(geojsonData);
      
      console.log('Starting road geometry processing...');
      const processedData = processRoadGeometry(geojsonData);
      console.log('Processing complete, result features:', processedData.features.length);
      
      return processedData;
    } catch (error) {
      console.error('=== FETCH ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Full error:', error);
      console.error('Stack trace:', error.stack);
      return null;
    }
  }, [supabaseUrl, supabaseKey]);

  // Handle zoom change
  const handleZoomChange = useCallback(() => {
    if (map) {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
    }
  }, [map]);

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
            // Fetch and add the buffered roads GeoJSON data
            console.log('Fetching and processing roads GeoJSON data...');
            const bufferedRoadsData = await fetchMergedRoadsGeoJSON();
            
            if (isCleanedUp) {
              console.log('MapLibre: Initialization cancelled due to cleanup');
              return;
            }
            
            if (!bufferedRoadsData || !bufferedRoadsData.features.length) {
              console.warn('No buffered roads data available, keeping basic OSM map');
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
                'fill-color': '#777777', // Gray color for all roads
                'fill-opacity': 0.8
              }
            });

            // Add subtle road outlines for better definition
            mapInstance!.addLayer({
              id: 'buffered-roads-outline',
              type: 'line',
              source: 'buffered-roads',
              paint: {
                'line-color': '#555555', // Darker gray for outlines
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10, 0.3,
                  15, 0.8,
                  18, 1.2
                ],
                'line-opacity': 0.6
              }
            });

            console.log('Buffered road layers added successfully!');
            
            // Debug: Log what was actually rendered
            setTimeout(() => {
              try {
                console.log('=== DEBUGGING RENDERED ROAD FEATURES ===');
                
                const roadFeatures = mapInstance!.queryRenderedFeatures(undefined, { 
                  layers: ['buffered-roads-fill'] 
                });
                console.log(`Rendered buffered road features: ${roadFeatures.length}`);
                
                if (roadFeatures.length > 0) {
                  console.log('Sample road feature:', roadFeatures[0]);
                  console.log('Road feature properties:', roadFeatures[0].properties);
                }
                
                // Check map bounds and zoom
                const bounds = mapInstance!.getBounds();
                const zoom = mapInstance!.getZoom();
                console.log(`Map zoom: ${zoom}`);
                console.log(`Map bounds:`, bounds.toArray());
                
              } catch (error) {
                console.warn('Error during road debugging:', error);
              }
            }, 2000);

          } catch (dataError) {
            console.error('Error adding buffered roads data to map:', dataError);
          }
          
          if (!isCleanedUp) {
            setMap(mapInstance);
            onMapLoad?.(mapInstance);
          }
        });

        // Add zoom change listener
        mapInstance.on('zoom', handleZoomChange);

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
  }, [supabaseUrl, supabaseKey, fetchMergedRoadsGeoJSON, handleZoomChange, onMapLoad]);

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