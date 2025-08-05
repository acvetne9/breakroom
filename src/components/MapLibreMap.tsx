import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  supabaseUrl: string;
  supabaseKey: string;
}

function debugGeoJSONProperties(geojsonData: any) {
  console.log('=== GeoJSON Debug Info ===');
  
  if (geojsonData?.features) {
    const polygonFeatures = geojsonData.features.filter((f: any) => 
      f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
    );
    
    const lineFeatures = geojsonData.features.filter((f: any) => 
      f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
    );
    
    console.log(`Found ${polygonFeatures.length} polygon features`);
    console.log(`Found ${lineFeatures.length} line features`);
    
    // Sample polygon features to see their properties
    polygonFeatures.slice(0, 5).forEach((feature: any, index: number) => {
      console.log(`Polygon Feature ${index}:`, {
        type: feature.geometry.type,
        properties: Object.keys(feature.properties || {}),
        sampleProps: feature.properties
      });
    });
    
    // Check for common properties used in styling
    const commonProperties = ['natural', 'leisure', 'landuse', 'highway', 'waterway', 'building', 'amenity'];
    commonProperties.forEach(prop => {
      const withProp = geojsonData.features.filter((f: any) => f.properties?.[prop]);
      if (withProp.length > 0) {
        console.log(`Features with '${prop}' property: ${withProp.length}`);
        // Show unique values for this property
        const uniqueValues = [...new Set(withProp.map((f: any) => f.properties[prop]))];
        console.log(`  Unique values for '${prop}':`, uniqueValues.slice(0, 10));
      }
    });
  } else {
    console.log('No features found in GeoJSON data');
  }
}

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

  // Function to fetch NYC GeoJSON from Supabase - memoized with empty deps to prevent reinitialization
  const fetchNYCGeoJSON = useCallback(async () => {
    try {
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
      debugGeoJSONProperties(geojsonData);
      return geojsonData;
    } catch (error) {
      console.error('Error fetching NYC GeoJSON from Supabase:', error);
      return null;
    }
  }, []);

  // Create a basic style with the GeoJSON data - memoized with empty deps
  const createMapStyle = useCallback((geojsonData: any) => {
    return {
      version: 8 as const,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
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
          source: 'osm',
          minzoom: 0,
          maxzoom: 19
        },
        // Water areas (polygons)
        {
          id: 'water-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['==', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#4A90E2',
            'fill-opacity': 0.8
          }
        },
        // Parks and green spaces
        {
          id: 'parks-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['any',
              ['==', ['get', 'leisure'], 'park'],
              ['==', ['get', 'landuse'], 'forest'],
              ['==', ['get', 'landuse'], 'grass'],
              ['==', ['get', 'natural'], 'wood']
            ]
          ],
          paint: {
            'fill-color': '#7CB342',
            'fill-opacity': 0.7
          }
        },
        // Buildings
        {
          id: 'buildings-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['has', 'building']
          ],
          paint: {
            'fill-color': '#D4D4D4',
            'fill-opacity': 0.8,
            'fill-outline-color': '#AAAAAA'
          }
        },
        // All other polygons with a default style
        {
          id: 'other-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['!', ['has', 'building']],
            ['!=', ['get', 'natural'], 'water'],
            ['!=', ['get', 'leisure'], 'park'],
            ['!=', ['get', 'landuse'], 'forest'],
            ['!=', ['get', 'landuse'], 'grass'],
            ['!=', ['get', 'natural'], 'wood']
          ],
          paint: {
            'fill-color': 'rgba(200,200,200,0.3)',
            'fill-opacity': 0.5
          }
        },
        // Major roads
        {
          id: 'major-roads',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['in', ['get', 'highway'], ['literal', ['primary', 'secondary', 'trunk', 'motorway']]]
          ],
          paint: {
            'line-color': '#FF6B35',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2,
              15, 4,
              18, 8
            ],
            'line-opacity': 0.8
          }
        },
        // Minor roads
        {
          id: 'minor-roads',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['in', ['get', 'highway'], ['literal', ['residential', 'tertiary', 'unclassified']]]
          ],
          paint: {
            'line-color': '#FFA726',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 1,
              15, 2,
              18, 4
            ],
            'line-opacity': 0.6
          }
        },
        // All other lines (fallback)
        {
          id: 'other-lines',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
            ['!', ['has', 'highway']]
          ],
          paint: {
            'line-color': '#CCCCCC',
            'line-width': 1,
            'line-opacity': 0.5
          }
        },
        // Points with labels
        {
          id: 'nyc-points',
          type: 'circle' as const,
          source: 'nyc-data',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': '#E91E63',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 3,
              15, 6,
              18, 10
            ],
            'circle-opacity': 0.8,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1
          }
        },
        // Point labels
        {
          id: 'nyc-labels',
          type: 'symbol' as const,
          source: 'nyc-data',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 10,
              15, 14,
              18, 18
            ],
            'text-anchor': 'top',
            'text-offset': [0, 1]
          },
          paint: {
            'text-color': '#333333',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 2
          }
        }
      ]
    };
  }, []);

  // Handle zoom change - memoized with empty deps since map is accessed from closure
  const handleZoomChange = useCallback(() => {
    if (map) {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
    }
  }, []);

  // Initialize map with Supabase GeoJSON data
  useEffect(() => {
    if (!mapRef.current) return;
    
    console.log('MapLibre: Initializing map...');
    let mapInstance: maplibregl.Map | null = null;
    let isCleanedUp = false;

    const initializeMap = async () => {
      try {
        // Fetch GeoJSON data from Supabase using current prop values
        const response = await fetch(`${supabaseUrl}/storage/v1/object/public/nyc-map-storage-files/nyc.geojson`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        let geojsonData = null;
        if (response.ok) {
          geojsonData = await response.json();
          debugGeoJSONProperties(geojsonData);
        } else {
          console.error('Failed to fetch GeoJSON:', response.statusText);
        }
        
        if (isCleanedUp) {
          console.log('MapLibre: Initialization cancelled due to cleanup');
          return;
        }
        
        if (!geojsonData) {
          console.error('Failed to load NYC GeoJSON data from Supabase');
          // Fallback to basic OSM tiles
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
          
          if (!isCleanedUp) {
            setMap(mapInstance);
            onMapLoad?.(mapInstance);
          }
          return;
        }

        // Create map with GeoJSON style
        const mapStyle = {
          version: 8 as const,
          glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
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
              source: 'osm',
              minzoom: 0,
              maxzoom: 19
            },
            // Water areas (polygons)
            {
              id: 'water-polygons',
              type: 'fill' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
                ['==', ['get', 'natural'], 'water']
              ],
              paint: {
                'fill-color': '#4A90E2',
                'fill-opacity': 0.8
              }
            },
            // Parks and green spaces
            {
              id: 'parks-polygons',
              type: 'fill' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
                ['any',
                  ['==', ['get', 'leisure'], 'park'],
                  ['==', ['get', 'landuse'], 'forest'],
                  ['==', ['get', 'landuse'], 'grass'],
                  ['==', ['get', 'natural'], 'wood']
                ]
              ],
              paint: {
                'fill-color': '#7CB342',
                'fill-opacity': 0.7
              }
            },
            // Buildings
            {
              id: 'buildings-polygons',
              type: 'fill' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
                ['has', 'building']
              ],
              paint: {
                'fill-color': '#D4D4D4',
                'fill-opacity': 0.8,
                'fill-outline-color': '#AAAAAA'
              }
            },
            // All other polygons with a default style
            {
              id: 'other-polygons',
              type: 'fill' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
                ['!', ['has', 'building']],
                ['!=', ['get', 'natural'], 'water'],
                ['!=', ['get', 'leisure'], 'park'],
                ['!=', ['get', 'landuse'], 'forest'],
                ['!=', ['get', 'landuse'], 'grass'],
                ['!=', ['get', 'natural'], 'wood']
              ],
              paint: {
                'fill-color': 'rgba(200,200,200,0.3)',
                'fill-opacity': 0.5
              }
            },
            // Major roads
            {
              id: 'major-roads',
              type: 'line' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                ['in', ['get', 'highway'], ['literal', ['primary', 'secondary', 'trunk', 'motorway']]]
              ],
              paint: {
                'line-color': '#FF6B35',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10, 2,
                  15, 4,
                  18, 8
                ],
                'line-opacity': 0.8
              }
            },
            // Minor roads
            {
              id: 'minor-roads',
              type: 'line' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                ['in', ['get', 'highway'], ['literal', ['residential', 'tertiary', 'unclassified']]]
              ],
              paint: {
                'line-color': '#FFA726',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  12, 1,
                  15, 2,
                  18, 4
                ],
                'line-opacity': 0.6
              }
            },
            // All other lines (fallback)
            {
              id: 'other-lines',
              type: 'line' as const,
              source: 'nyc-data',
              filter: [
                'all',
                ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
                ['!', ['has', 'highway']]
              ],
              paint: {
                'line-color': '#CCCCCC',
                'line-width': 1,
                'line-opacity': 0.5
              }
            },
            // Points with labels
            {
              id: 'nyc-points',
              type: 'circle' as const,
              source: 'nyc-data',
              filter: ['==', ['geometry-type'], 'Point'],
              paint: {
                'circle-color': '#E91E63',
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10, 3,
                  15, 6,
                  18, 10
                ],
                'circle-opacity': 0.8,
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 1
              }
            },
            // Point labels
            {
              id: 'nyc-labels',
              type: 'symbol' as const,
              source: 'nyc-data',
              filter: ['==', ['geometry-type'], 'Point'],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Open Sans Regular'],
                'text-size': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10, 10,
                  15, 14,
                  18, 18
                ],
                'text-anchor': 'top',
                'text-offset': [0, 1]
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 2
              }
            }
          ]
        };
        
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: mapStyle as any,
          center: [-73.9712, 40.7831], // NYC center
          zoom: 14,
          maxBounds: [
            [-74.2557, 40.4960], // Southwest corner (Staten Island)
            [-73.7004, 40.9152]  // Northeast corner (Bronx)
          ]
        });

        // Add zoom change listener
        mapInstance.on('zoom', handleZoomChange);

        // Map load event
        mapInstance.on('load', () => {
          console.log('MapLibre: Map loaded with NYC GeoJSON from Supabase');
          
          // Debug: Log what layers are loaded
          const style = mapInstance!.getStyle();
          console.log('Loaded layers:', style.layers.map(l => l.id));
          
          // Debug: Check if source has data
          const source = mapInstance!.getSource('nyc-data') as maplibregl.GeoJSONSource;
          if (source) {
            console.log('NYC data source loaded successfully');
          }
          
          if (!isCleanedUp) {
            onMapLoad?.(mapInstance);
          }
        });

        // Error handling
        mapInstance.on('error', (e) => {
          console.error('MapLibre: Map error:', e);
        });

        // Debug: Log style errors
        mapInstance.on('styleimagemissing', (e) => {
          console.warn('MapLibre: Missing style image:', e.id);
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
  }, []); // Empty dependency array to prevent re-initialization

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