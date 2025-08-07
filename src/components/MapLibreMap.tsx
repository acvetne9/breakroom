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

// Enhanced function to convert road lines to polygons using Turf.js
const processRoadGeometry = (geojsonData: any) => {
  console.log('Processing road geometry...');
  
  try {
    const processedFeatures: any[] = [];
    let successCount = 0;
    let errorCount = 0;
    let roadCount = 0;
    
    geojsonData.features.forEach((feature: any, index: number) => {
      // More comprehensive road detection
      const isRoad = feature.properties?.highway || 
                    feature.properties?.bridge || 
                    feature.properties?.tunnel ||
                    (feature.properties?.man_made && ['bridge_support', 'pier'].includes(feature.properties.man_made)) ||
                    (feature.properties?.type === 'route') ||
                    (feature.properties?.route === 'road');
      
      if (isRoad && (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString')) {
        roadCount++;
        console.log(`Processing road ${roadCount} (index ${index}):`, {
          highway: feature.properties?.highway,
          bridge: feature.properties?.bridge,
          tunnel: feature.properties?.tunnel,
          geometryType: feature.geometry.type,
          coordinateCount: feature.geometry.coordinates?.length
        });
        
        try {
          // Determine buffer width based on road type (in meters, converted to degrees approximately)
          let bufferWidthMeters = 5; // Default 5 meters
          
          if (feature.properties?.highway) {
            const roadType = feature.properties.highway;
            switch (roadType) {
              case 'motorway':
              case 'trunk':
                bufferWidthMeters = 15;
                break;
              case 'primary':
                bufferWidthMeters = 12;
                break;
              case 'secondary':
                bufferWidthMeters = 10;
                break;
              case 'tertiary':
              case 'residential':
                bufferWidthMeters = 8;
                break;
              case 'service':
                bufferWidthMeters = 4;
                break;
              case 'footway':
              case 'path':
                bufferWidthMeters = 2;
                break;
              default:
                bufferWidthMeters = 6;
            }
          }
          
          // Buffer the line to create a polygon - using meters for more accurate results
          const buffered = turf.buffer(feature, bufferWidthMeters, { units: 'meters' });
          
          if (buffered && buffered.geometry && buffered.geometry.coordinates && buffered.geometry.coordinates.length > 0) {
            // Preserve original properties and add road indicator
            const processedFeature = {
              ...buffered,
              properties: {
                ...feature.properties,
                original_geometry_type: feature.geometry.type,
                is_road_polygon: true,
                buffer_width_meters: bufferWidthMeters,
                road_type: feature.properties?.highway || 'unknown'
              }
            };
            
            processedFeatures.push(processedFeature);
            successCount++;
            
            // Log first few successful conversions for debugging
            if (successCount <= 3) {
              console.log(`Successfully buffered road ${successCount}:`, {
                original: feature.geometry.type,
                new: processedFeature.geometry.type,
                roadType: feature.properties?.highway,
                bufferWidth: bufferWidthMeters
              });
            }
          } else {
            console.warn(`Buffer returned invalid result for road at index ${index}`);
            // Keep original feature if buffering returns invalid result
            processedFeatures.push(feature);
            errorCount++;
          }
        } catch (error) {
          console.warn(`Failed to buffer road feature at index ${index}:`, error);
          // Keep original feature if buffering fails
          processedFeatures.push(feature);
          errorCount++;
        }
      } else {
        // Keep non-road features as-is
        processedFeatures.push(feature);
      }
    });
    
    console.log(`Road processing complete: 
      - Total roads found: ${roadCount}
      - Successfully converted: ${successCount}
      - Errors: ${errorCount}
      - Total processed features: ${processedFeatures.length}`);
    
    // Verify we have road polygons
    const roadPolygons = processedFeatures.filter(f => f.properties?.is_road_polygon === true);
    console.log(`Final road polygons in processed data: ${roadPolygons.length}`);
    
    if (roadPolygons.length > 0) {
      console.log('Sample road polygon properties:', roadPolygons[0].properties);
      console.log('Sample road polygon geometry type:', roadPolygons[0].geometry.type);
    }
    
    return {
      ...geojsonData,
      features: processedFeatures
    };
    
  } catch (error) {
    console.error('Critical error in processRoadGeometry:', error);
    // Return original data if processing fails completely
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

  // Function to fetch NYC GeoJSON from Supabase
  const fetchNYCGeoJSON = useCallback(async () => {
    try {
      console.log('Fetching NYC GeoJSON from Supabase...');
      const response = await fetch(`${supabaseUrl}/storage/v1/object/public/nyc-map-storage-files/nyc.geojson`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON: ${response.statusText}`);
      }
      
      const geojsonData = await response.json();
      console.log('GeoJSON fetched successfully, starting debug...');
      debugGeoJSONProperties(geojsonData);
      
      console.log('Starting road geometry processing...');
      // Process road geometry to convert lines to polygons
      const processedData = processRoadGeometry(geojsonData);
      console.log('Road geometry processing complete');
      
      return processedData;
    } catch (error) {
      console.error('Error fetching NYC GeoJSON from Supabase:', error);
      return null;
    }
  }, [supabaseUrl, supabaseKey]);

  // Enhanced map style with improved gray road styling
  const createMapStyle = useCallback((geojsonData: any) => {
    return {
      version: 8 as const,
      sources: {
        'nyc-data': {
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
        // Road polygons (converted from lines) - Main gray roads
        {
          id: 'road-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['get', 'is_road_polygon'], true],
            ['==', ['geometry-type'], 'Polygon']
          ],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'road_type'], 'motorway'], '#555555',
              ['==', ['get', 'road_type'], 'trunk'], '#555555',
              ['==', ['get', 'road_type'], 'primary'], '#666666',
              ['==', ['get', 'road_type'], 'secondary'], '#777777',
              ['==', ['get', 'road_type'], 'tertiary'], '#777777',
              ['==', ['get', 'road_type'], 'residential'], '#888888',
              ['==', ['get', 'road_type'], 'service'], '#999999',
              ['has', 'tunnel'], '#444444',
              ['has', 'bridge'], '#888888',
              '#777777' // default gray
            ],
            'fill-opacity': 0.9
          }
        },
        // Road polygon outlines for better definition
        {
          id: 'road-polygon-outlines',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['get', 'is_road_polygon'], true],
            ['==', ['geometry-type'], 'Polygon']
          ],
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
        // MultiPolygon road features
        {
          id: 'road-multipolygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', ['get', 'is_road_polygon'], true],
            ['==', ['geometry-type'], 'MultiPolygon']
          ],
          paint: {
            'fill-color': '#777777',
            'fill-opacity': 0.9
          }
        },
        // Fallback for any remaining road lines that weren't converted
        {
          id: 'remaining-road-lines',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['!=', ['get', 'is_road_polygon'], true],
            ['any',
              ['has', 'highway'],
              ['has', 'bridge'],
              ['has', 'tunnel']
            ]
          ],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], '#555555',
              ['==', ['get', 'highway'], 'trunk'], '#555555',
              ['==', ['get', 'highway'], 'primary'], '#666666',
              ['==', ['get', 'highway'], 'secondary'], '#777777',
              ['==', ['get', 'highway'], 'tertiary'], '#777777',
              ['==', ['get', 'highway'], 'residential'], '#888888',
              ['has', 'tunnel'], '#444444',
              ['has', 'bridge'], '#888888',
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
              ['==', ['get', 'highway'], 'footway'], 1,
              ['==', ['get', 'highway'], 'path'], 1,
              2
            ],
            'line-opacity': 0.9
          }
        },
        // Other polygon features (buildings, etc.) - keep transparent
        {
          id: 'other-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['!=', ['get', 'is_road_polygon'], true],
            ['!has', 'highway']
          ],
          paint: {
            'fill-color': '#00000000',
            'fill-opacity': 0
          }
        },
        // Other lines (non-roads) - light gray
        {
          id: 'other-lines',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['!=', ['get', 'is_road_polygon'], true],
            ['!has', 'highway'],
            ['!has', 'bridge'],
            ['!has', 'tunnel']
          ],
          paint: {
            'line-color': '#cccccc',
            'line-width': 1,
            'line-opacity': 0.3
          }
        },
        // Points
        {
          id: 'points',
          type: 'circle' as const,
          source: 'nyc-data',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': '#aaaaaa',
            'circle-radius': 2,
            'circle-opacity': 0.5
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

  // Initialize map with Supabase GeoJSON data
  useEffect(() => {
    if (!mapRef.current) return;
    
    console.log('MapLibre: Initializing map...');
    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initializeMap = async () => {
      try {
        console.log('=== MAP INITIALIZATION START ===');
        
        // First, create a basic map to test if MapLibre is working
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
            // Now fetch and add the GeoJSON data
            console.log('Fetching GeoJSON data...');
            const geojsonData = await fetchNYCGeoJSON();
            
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

            console.log('Adding NYC data source to map...');
            // Add the processed GeoJSON as a source
            mapInstance!.addSource('nyc-data', {
              type: 'geojson',
              data: geojsonData
            });

            console.log('Adding road polygon layers...');
            // Add road polygon fill layer
            mapInstance!.addLayer({
              id: 'road-polygons',
              type: 'fill',
              source: 'nyc-data',
              filter: [
                'all',
                ['==', ['get', 'is_road_polygon'], true],
                ['==', ['geometry-type'], 'Polygon']
              ],
              paint: {
                'fill-color': [
                  'case',
                  ['==', ['get', 'road_type'], 'motorway'], '#555555',
                  ['==', ['get', 'road_type'], 'trunk'], '#555555',
                  ['==', ['get', 'road_type'], 'primary'], '#666666',
                  ['==', ['get', 'road_type'], 'secondary'], '#777777',
                  ['==', ['get', 'road_type'], 'tertiary'], '#777777',
                  ['==', ['get', 'road_type'], 'residential'], '#888888',
                  ['==', ['get', 'road_type'], 'service'], '#999999',
                  ['has', 'tunnel'], '#444444',
                  ['has', 'bridge'], '#888888',
                  '#777777'
                ],
                'fill-opacity': 0.9
              }
            });

            // Add road polygon outline layer
            mapInstance!.addLayer({
              id: 'road-polygon-outlines',
              type: 'line',
              source: 'nyc-data',
              filter: [
                'all',
                ['==', ['get', 'is_road_polygon'], true],
                ['==', ['geometry-type'], 'Polygon']
              ],
              paint: {
                'line-color': '#555555',
                'line-width': 0.8,
                'line-opacity': 0.6
              }
            });

            // Add MultiPolygon road features
            mapInstance!.addLayer({
              id: 'road-multipolygons',
              type: 'fill',
              source: 'nyc-data',
              filter: [
                'all',
                ['==', ['get', 'is_road_polygon'], true],
                ['==', ['geometry-type'], 'MultiPolygon']
              ],
              paint: {
                'fill-color': '#777777',
                'fill-opacity': 0.9
              }
            });

            console.log('Adding fallback road lines layer...');
            // Add remaining road lines (fallback)
            mapInstance!.addLayer({
              id: 'remaining-road-lines',
              type: 'line',
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                ['!=', ['get', 'is_road_polygon'], true],
                ['any',
                  ['has', 'highway'],
                  ['has', 'bridge'],
                  ['has', 'tunnel']
                ]
              ],
              paint: {
                'line-color': '#777777',
                'line-width': 3,
                'line-opacity': 0.8
              }
            });

            console.log('All layers added successfully!');
            
            // Debug: Check what was actually added
            setTimeout(() => {
              try {
                const roadPolygons = mapInstance!.queryRenderedFeatures(undefined, { layers: ['road-polygons'] });
                const roadMultiPolygons = mapInstance!.queryRenderedFeatures(undefined, { layers: ['road-multipolygons'] });
                const roadLines = mapInstance!.queryRenderedFeatures(undefined, { layers: ['remaining-road-lines'] });
                console.log(`Rendered features: ${roadPolygons.length} polygons, ${roadMultiPolygons.length} multipolygons, ${roadLines.length} lines`);
                
                if (roadPolygons.length > 0) {
                  console.log('Sample road polygon feature:', roadPolygons[0]);
                }
              } catch (error) {
                console.warn('Could not query rendered features:', error);
              }
            }, 2000);

          } catch (dataError) {
            console.error('Error adding GeoJSON data to map:', dataError);
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