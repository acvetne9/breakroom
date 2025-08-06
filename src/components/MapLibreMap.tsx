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
  }, [supabaseUrl, supabaseKey]);

  // Super simple diagnostic style - show everything first
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
        {
          id: 'gray-all-lines',
          type: 'line' as const,
          source: 'nyc-data',
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
          paint: {
            'line-color': '#808080',
            'line-width': 2,
            'line-opacity': 1.0
          }
        },
        {
          id: 'gray-road-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
            ['has', 'highway']
          ],
          paint: {
            'fill-color': '#808080',
            'fill-opacity': 1.0
          }
        },
        {
          id: 'some-polygons',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint: {
            'fill-color': '#00000000',
            'fill-opacity': 0
          }
        },
        {
          id: 'points',
          type: 'circle' as const,
          source: 'nyc-data',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': '#0000FF',
            'circle-radius': 4
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
        // Fetch GeoJSON data from Supabase
        const geojsonData = await fetchNYCGeoJSON();
        
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

        // Create map with updated style
        mapInstance = new maplibregl.Map({
          container: mapRef.current!,
          style: createMapStyle(geojsonData) as any,
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
          console.log('Loaded layers:', style.layers.map(l => ({ id: l.id, type: l.type })));
          
          // Debug: Check if source has data and count features
          const source = mapInstance!.getSource('nyc-data') as maplibregl.GeoJSONSource;
          if (source) {
            console.log('NYC data source loaded successfully');
            // Try to query rendered features
            setTimeout(() => {
              try {
                const features = mapInstance!.querySourceFeatures('nyc-data');
                console.log(`Queried ${features.length} features from source`);
                if (features.length > 0) {
                  console.log('Sample queried feature:', features[0]);
                }
              } catch (error) {
                console.warn('Could not query source features:', error);
              }
            }, 1000);
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

        // Debug: Log when data is loaded
        mapInstance.on('sourcedata', (e) => {
          if (e.sourceId === 'nyc-data' && e.isSourceLoaded) {
            console.log('NYC data source finished loading');
          }
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