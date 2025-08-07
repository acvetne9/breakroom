import React, { useEffect, useRef, useState, useCallback } from 'react';
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

// Since the roads are already merged and processed, we can simplify this function
const processRoadGeometry = (geojsonData: any) => {
  console.log('Processing merged road geometry...');
  
  try {
    // The merged_roads.geojson.gz should already contain processed road polygons
    // so we may not need to do much processing here
    console.log(`Total features in merged roads: ${geojsonData.features?.length || 0}`);
    
    // Check what types of geometries we have
    const geometryTypes = geojsonData.features?.reduce((acc: any, f: any) => {
      const type = f.geometry.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}) || {};
    
    console.log('Geometry types in merged roads:', geometryTypes);
    
    // If the roads are already polygons, just return as-is
    return geojsonData;
    
  } catch (error) {
    console.error('Error processing merged road geometry:', error);
    return geojsonData;
  }
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

  // Function to decompress gzipped content
  const decompressGzip = async (response: Response): Promise<any> => {
    try {
      // Check if the browser supports CompressionStream (modern browsers)
      if ('DecompressionStream' in window) {
        console.log('Using browser native decompression...');
        const stream = new ReadableStream({
          start(controller) {
            response.body?.getReader().read().then(function pump({ done, value }): any {
              if (done) {
                controller.close();
                return;
              }
              controller.enqueue(value);
              return response.body?.getReader().read().then(pump);
            });
          }
        });
        
        const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
        const decompressedResponse = new Response(decompressedStream);
        return await decompressedResponse.json();
      } else {
        console.log('Browser native decompression not available, trying direct JSON parse...');
        // Fallback: try to parse directly (in case the server auto-decompresses)
        return await response.json();
      }
    } catch (error) {
      console.warn('Decompression failed, trying direct JSON parse:', error);
      // Final fallback
      return await response.json();
    }
  };

  // Function to fetch merged roads GeoJSON from Supabase
  const fetchMergedRoadsGeoJSON = useCallback(async () => {
    try {
      console.log('Fetching merged roads GeoJSON from Supabase...');
      const response = await fetch(`${supabaseUrl}/storage/v1/object/public/nyc-map-storage-files/merged_roads.geojson.gz`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json, application/gzip',
          'Accept-Encoding': 'gzip'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON: ${response.statusText}`);
      }
      
      console.log('Response received, attempting to decompress...');
      const geojsonData = await decompressGzip(response);
      
      console.log('Merged roads GeoJSON loaded successfully, starting debug...');
      debugGeoJSONProperties(geojsonData);
      
      console.log('Processing merged road geometry...');
      const processedData = processRoadGeometry(geojsonData);
      console.log('Merged road geometry processing complete');
      
      return processedData;
    } catch (error) {
      console.error('Error fetching merged roads GeoJSON from Supabase:', error);
      return null;
    }
  }, [supabaseUrl, supabaseKey]);

  // Enhanced map style for merged roads
  const createMapStyle = useCallback((geojsonData: any) => {
    return {
      version: 8 as const,
      sources: {
        'merged-roads': {
          type: 'geojson' as const,
          data: geojsonData
        },
        'osm': {
          type: 'raster' as const,
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'osm-tiles',
          type: 'raster' as const,
          source: 'osm'
        },
        // Main road polygons from merged data
        {
          id: 'merged-road-polygons',
          type: 'fill' as const,
          source: 'merged-roads',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], '#555555',
              ['==', ['get', 'highway'], 'trunk'], '#555555',
              ['==', ['get', 'highway'], 'primary'], '#666666',
              ['==', ['get', 'highway'], 'secondary'], '#777777',
              ['==', ['get', 'highway'], 'tertiary'], '#777777',
              ['==', ['get', 'highway'], 'residential'], '#888888',
              ['==', ['get', 'highway'], 'service'], '#999999',
              ['has', 'tunnel'], '#444444',
              ['has', 'bridge'], '#888888',
              '#777777' // default gray
            ],
            'fill-opacity': 0.9
          }
        },
        // MultiPolygon roads from merged data
        {
          id: 'merged-road-multipolygons',
          type: 'fill' as const,
          source: 'merged-roads',
          filter: ['==', ['geometry-type'], 'MultiPolygon'],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], '#555555',
              ['==', ['get', 'highway'], 'trunk'], '#555555',
              ['==', ['get', 'highway'], 'primary'], '#666666',
              ['==', ['get', 'highway'], 'secondary'], '#777777',
              ['==', ['get', 'highway'], 'tertiary'], '#777777',
              ['==', ['get', 'highway'], 'residential'], '#888888',
              ['==', ['get', 'highway'], 'service'], '#999999',
              ['has', 'tunnel'], '#444444',
              ['has', 'bridge'], '#888888',
              '#777777'
            ],
            'fill-opacity': 0.9
          }
        },
        // Road outlines for better definition
        {
          id: 'merged-road-outlines',
          type: 'line' as const,
          source: 'merged-roads',
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint: {
            'line-color': '#555555',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.5,
              15, 1,
              18, 1.5
            ],
            'line-opacity': 0.6
          }
        },
        // Fallback for any line strings that might still exist
        {
          id: 'merged-road-lines',
          type: 'line' as const,
          source: 'merged-roads',
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], '#555555',
              ['==', ['get', 'highway'], 'trunk'], '#555555',
              ['==', ['get', 'highway'], 'primary'], '#666666',
              ['==', ['get', 'highway'], 'secondary'], '#777777',
              ['==', ['get', 'highway'], 'tertiary'], '#777777',
              ['==', ['get', 'highway'], 'residential'], '#888888',
              '#777777'
            ],
            'line-width': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], 8,
              ['==', ['get', 'highway'], 'trunk'], 6,
              ['==', ['get', 'highway'], 'primary'], 5,
              ['==', ['get', 'highway'], 'secondary'], 4,
              ['==', ['get', 'highway'], 'tertiary'], 3,
              ['==', ['get', 'highway'], 'residential'], 3,
              ['==', ['get', 'highway'], 'service'], 2,
              2
            ],
            'line-opacity': 0.9
          }
        }
      ]
    };
  }, []);

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
    
    console.log('MapLibre: Initializing map with merged roads...');
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
            // Fetch and add the merged roads GeoJSON data
            console.log('Fetching merged roads GeoJSON data...');
            const geojsonData = await fetchMergedRoadsGeoJSON();
            
            if (isCleanedUp) {
              console.log('MapLibre: Initialization cancelled due to cleanup');
              return;
            }
            
            if (!geojsonData) {
              console.warn('No merged roads GeoJSON data available, keeping basic OSM map');
              if (!isCleanedUp) {
                setMap(mapInstance);
                onMapLoad?.(mapInstance);
              }
              return;
            }

            console.log('Adding merged roads data source to map...');
            // Add the merged roads GeoJSON as a source
            mapInstance!.addSource('merged-roads', {
              type: 'geojson',
              data: geojsonData
            });

            console.log('Adding merged road polygon layers...');
            // Add road polygon fill layer
            mapInstance!.addLayer({
              id: 'merged-road-polygons',
              type: 'fill',
              source: 'merged-roads',
              filter: ['==', ['geometry-type'], 'Polygon'],
              paint: {
                'fill-color': [
                  'case',
                  ['==', ['get', 'highway'], 'motorway'], '#555555',
                  ['==', ['get', 'highway'], 'trunk'], '#555555',
                  ['==', ['get', 'highway'], 'primary'], '#666666',
                  ['==', ['get', 'highway'], 'secondary'], '#777777',
                  ['==', ['get', 'highway'], 'tertiary'], '#777777',
                  ['==', ['get', 'highway'], 'residential'], '#888888',
                  ['==', ['get', 'highway'], 'service'], '#999999',
                  ['has', 'tunnel'], '#444444',
                  ['has', 'bridge'], '#888888',
                  '#777777'
                ],
                'fill-opacity': 0.9
              }
            });

            // Add MultiPolygon road features
            mapInstance!.addLayer({
              id: 'merged-road-multipolygons',
              type: 'fill',
              source: 'merged-roads',
              filter: ['==', ['geometry-type'], 'MultiPolygon'],
              paint: {
                'fill-color': [
                  'case',
                  ['==', ['get', 'highway'], 'motorway'], '#555555',
                  ['==', ['get', 'highway'], 'trunk'], '#555555',
                  ['==', ['get', 'highway'], 'primary'], '#666666',
                  ['==', ['get', 'highway'], 'secondary'], '#777777',
                  ['==', ['get', 'highway'], 'tertiary'], '#777777',
                  ['==', ['get', 'highway'], 'residential'], '#888888',
                  ['==', ['get', 'highway'], 'service'], '#999999',
                  ['has', 'tunnel'], '#444444',
                  ['has', 'bridge'], '#888888',
                  '#777777'
                ],
                'fill-opacity': 0.9
              }
            });

            // Transportation polygon outline layer
            mapInstance!.addLayer({
              id: 'transportation-outlines',
              type: 'line',
              source: 'merged-roads',
              filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
              paint: {
                'line-color': '#555555', // Darker gray for outlines
                'line-width': 0.8,
                'line-opacity': 0.6
              }
            });

            console.log('Adding fallback transportation lines layer...');
            // Add any remaining transportation lines (fallback) - all gray
            mapInstance!.addLayer({
              id: 'transportation-lines',
              type: 'line',
              source: 'merged-roads',
              filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
              paint: {
                'line-color': '#777777', // Consistent gray for all transportation lines
                'line-width': 3,
                'line-opacity': 0.8
              }
            });

            console.log('All debug layers added successfully!');
            
            // Debug: Check what was actually added
            setTimeout(() => {
              try {
                const transportationPolygons = mapInstance!.queryRenderedFeatures(undefined, { layers: ['transportation-polygons'] });
                const transportationMultiPolygons = mapInstance!.queryRenderedFeatures(undefined, { layers: ['transportation-multipolygons'] });
                const transportationLines = mapInstance!.queryRenderedFeatures(undefined, { layers: ['transportation-lines'] });
                console.log(`Rendered transportation features: ${transportationPolygons.length} polygons, ${transportationMultiPolygons.length} multipolygons, ${transportationLines.length} lines`);
                
                if (transportationPolygons.length > 0) {
                  console.log('Sample transportation polygon feature:', transportationPolygons[0]);
                }
              } catch (error) {
                console.warn('Could not query rendered features:', error);
              }
            }, 2000);

          } catch (dataError) {
            console.error('Error adding merged roads GeoJSON data to map:', dataError);
          }
          
          if (!isCleanedUp) {
            onMapLoad?.(mapInstance);
          }
        });

        // Add zoom change listener
        mapInstance.on('zoom', handleZoomChange);

        // Error handling
        mapInstance.on('error', (e) => {
          console.error('MapLibre: Map error:', e);
        });

        if (!isCleanedUp) {
          setMap(mapInstance);
          console.log('MapLibre: Map instance set to state');
        }

      } catch (error) {
        console.error('MapLibre: Error during initialization:', error);
      }
    };

    initializeMap();

    return () => {
      console.log('MapLibre: Cleanup function called');
      isCleanedUp = true;
      
      // Cleanup function - use the local mapInstance variable
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
  }, [supabaseUrl, supabaseKey]);

  // Create marker clustering (unchanged)
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