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
      return geojsonData;
    } catch (error) {
      console.error('Error fetching NYC GeoJSON from Supabase:', error);
      return null;
    }
  }, [supabaseUrl, supabaseKey]);

  // Create a basic style with the GeoJSON data
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
        // Base OSM layer - but only show water and land, not roads
        {
          id: 'osm-tiles',
          type: 'raster' as const,
          source: 'osm',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-opacity': 0.3 // Make OSM more subtle as background
          }
        },
        // Water areas from NYC data
        {
          id: 'nyc-water',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            ['==', ['get', 'natural'], 'water']
          ],
          paint: {
            'fill-color': '#04AEF6',
            'fill-opacity': 0.8
          }
        },
        // Parks and green spaces
        {
          id: 'nyc-parks',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', '$type', 'Polygon'],
            [
              'any',
              ['==', ['get', 'leisure'], 'park'],
              ['==', ['get', 'landuse'], 'forest'],
              ['==', ['get', 'landuse'], 'grass']
            ]
          ],
          paint: {
            'fill-color': '#8BCE64',
            'fill-opacity': 0.8
          }
        },
        // Roads and transportation infrastructure - this layer will override OSM roads
        {
          id: 'nyc-roads',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', '$type', 'LineString'],
            [
              'any',
              // All highway types
              ['in', ['get', 'highway'], ['literal', [
                'motorway', 'motorway_link',
                'trunk', 'trunk_link', 
                'primary', 'primary_link',
                'secondary', 'secondary_link',
                'tertiary', 'tertiary_link',
                'residential', 'living_street',
                'service', 'unclassified',
                'road', 'track', 'path',
                'footway', 'cycleway', 'bridleway',
                'steps', 'pedestrian'
              ]]],
              // Bridge structures
              ['==', ['get', 'man_made'], 'bridge'],
              ['==', ['get', 'bridge'], 'yes'],
              // Tunnel structures  
              ['==', ['get', 'tunnel'], 'yes'],
              // Railway lines
              ['in', ['get', 'railway'], ['literal', ['rail', 'subway', 'light_rail', 'tram']]]
            ]
          ],
          paint: {
            'line-color': '#CCCCCC', // All roads, bridges, tunnels will be this color
            'line-width': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], 4,
              ['in', ['get', 'highway'], ['literal', ['motorway_link', 'trunk']]], 3,
              ['in', ['get', 'highway'], ['literal', ['trunk_link', 'primary']]], 2.5,
              ['in', ['get', 'highway'], ['literal', ['primary_link', 'secondary']]], 2,
              ['in', ['get', 'highway'], ['literal', ['secondary_link', 'tertiary']]], 1.5,
              ['in', ['get', 'highway'], ['literal', ['tertiary_link', 'residential', 'living_street']]], 1.2,
              ['in', ['get', 'railway'], ['literal', ['rail', 'subway', 'light_rail']]], 2,
              ['==', ['get', 'railway'], 'tram'], 1,
              // Bridge width adjustments
              ['==', ['get', 'bridge'], 'yes'], ['+', ['case', 
                ['==', ['get', 'highway'], 'motorway'], 4,
                ['in', ['get', 'highway'], ['literal', ['trunk', 'primary']]], 2.5,
                1.2
              ], 0.5],
              // Tunnel width adjustments
              ['==', ['get', 'tunnel'], 'yes'], ['-', ['case',
                ['==', ['get', 'highway'], 'motorway'], 4,
                ['in', ['get', 'highway'], ['literal', ['trunk', 'primary']]], 2.5,
                1.2
              ], 0.3],
              1
            ],
            'line-opacity': [
              'case',
              ['==', ['get', 'tunnel'], 'yes'], 0.7, // Make tunnels slightly transparent
              1
            ]
          }
        },
        // Coastlines and water boundaries
        {
          id: 'nyc-coastline',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'all',
            ['==', '$type', 'LineString'],
            ['==', ['get', 'natural'], 'coastline']
          ],
          paint: {
            'line-color': '#04AEF6',
            'line-width': 1
          }
        },
        // Labels and points of interest
        {
          id: 'nyc-labels',
          type: 'symbol' as const,
          source: 'nyc-data',
          filter: ['==', '$type', 'Point'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': 12,
            'text-anchor': 'center'
          },
          paint: {
            'text-color': '#333333',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
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

        // Create map with GeoJSON style
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
          if (!isCleanedUp) {
            onMapLoad?.(mapInstance);
          }
        });

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
  }, [supabaseUrl, supabaseKey]); // Only depend on the actual data we need

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
        // Create cluster marker (commented out but can be enabled)
        // const el = document.createElement('div');
        // el.className = 'cluster-marker';
        // el.style.cssText = `
        //   background: hsl(var(--primary));
        //   border: 2px solid hsl(var(--primary-foreground));
        //   border-radius: 50%;
        //   width: 40px;
        //   height: 40px;
        //   display: flex;
        //   align-items: center;
        //   justify-content: center;
        //   color: hsl(var(--primary-foreground));
        //   font-weight: bold;
        //   font-size: 12px;
        //   cursor: pointer;
        // `;
        // el.textContent = cluster.properties.point_count_abbreviated;
        
        // const marker = new maplibregl.Marker({ element: el })
        //   .setLngLat([lng, lat])
        //   .addTo(map);

        // el.addEventListener('click', () => {
        //   const expansionZoom = clusterRef.current?.getClusterExpansionZoom(cluster.properties.cluster_id);
        //   map.easeTo({
        //     center: [lng, lat],
        //     zoom: expansionZoom || currentZoom + 2
        //   });
        // });

        // newMarkers.push(marker);
      } else {
        // Create individual business marker
        const el = document.createElement('div');
        el.className = 'business-marker';
        el.style.cssText = `
          background: #FFEB3B;
          border: 1px solid #FFC107;
          border-radius: 50%;
          width: 12px;
          height: 12px;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
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
        
        if (cluster.properties.cluster) {
          // Cluster markers (commented out)
        } else {
          const el = document.createElement('div');
          el.className = 'business-marker';
          el.style.cssText = `
            background: #FFEB3B;
            border: 1px solid #FFC107;
            border-radius: 50%;
            width: 12px;
            height: 12px;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
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