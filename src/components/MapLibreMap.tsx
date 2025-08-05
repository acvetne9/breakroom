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
      console.log('GeoJSON data loaded:', geojsonData); // Debug log
      return geojsonData;
    } catch (error) {
      console.error('Error fetching NYC GeoJSON from Supabase:', error);
      return null;
    }
  }, [supabaseUrl, supabaseKey]);

  // Create a basic style with the GeoJSON data and enhanced colors
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
          maxzoom: 19,
          paint: {
            'raster-opacity': 0.7 // Make base tiles more transparent to show colors better
          }
        },
        // Water areas - more vibrant blue
        {
          id: 'nyc-water',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'natural'], 'water'],
            ['==', ['get', 'waterway'], 'river'],
            ['==', ['get', 'waterway'], 'canal'],
            ['==', ['get', 'landuse'], 'reservoir']
          ],
          paint: {
            'fill-color': '#1E88E5', // Brighter blue
            'fill-opacity': 0.9
          }
        },
        // Parks and green spaces - vibrant green
        {
          id: 'nyc-parks',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'leisure'], 'park'],
            ['==', ['get', 'landuse'], 'forest'],
            ['==', ['get', 'landuse'], 'grass'],
            ['==', ['get', 'natural'], 'wood']
          ],
          paint: {
            'fill-color': '#43A047', // Vibrant green
            'fill-opacity': 0.8
          }
        },
        // Buildings - light gray with outline
        {
          id: 'nyc-buildings',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: ['==', ['get', 'building'], 'yes'],
          paint: {
            'fill-color': '#E8EAF6', // Light purple-gray
            'fill-opacity': 0.6,
            'fill-outline-color': '#9C27B0'
          }
        },
        // Residential areas - warm beige
        {
          id: 'nyc-residential',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'landuse'], 'residential'],
            ['==', ['get', 'place'], 'neighbourhood']
          ],
          paint: {
            'fill-color': '#FFF3E0', // Warm beige
            'fill-opacity': 0.6
          }
        },
        // Commercial areas - light purple
        {
          id: 'nyc-commercial',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'landuse'], 'commercial'],
            ['==', ['get', 'landuse'], 'retail']
          ],
          paint: {
            'fill-color': '#F3E5F5', // Light purple
            'fill-opacity': 0.7
          }
        },
        // Industrial areas - light orange
        {
          id: 'nyc-industrial',
          type: 'fill' as const,
          source: 'nyc-data',
          filter: ['==', ['get', 'landuse'], 'industrial'],
          paint: {
            'fill-color': '#FFE0B2', // Light orange
            'fill-opacity': 0.7
          }
        },
        // Roads, tunnels, and bridges - all gray
        {
          id: 'nyc-roads',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['has', 'highway'],
            ['==', ['get', 'tunnel'], 'yes'],
            ['==', ['get', 'bridge'], 'yes']
          ],
          paint: {
            'line-color': '#CCCCCC', // All roads, tunnels, and bridges are now gray
            'line-width': [
              'case',
              ['==', ['get', 'highway'], 'motorway'], 6,
              ['==', ['get', 'highway'], 'trunk'], 4,
              ['==', ['get', 'highway'], 'primary'], 3,
              ['==', ['get', 'highway'], 'secondary'], 2.5,
              ['==', ['get', 'highway'], 'tertiary'], 2,
              1.5
            ],
            'line-opacity': 0.8
          }
        },
        // Railways - purple lines
        {
          id: 'nyc-railways',
          type: 'line' as const,
          source: 'nyc-data',
          filter: ['has', 'railway'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'railway'], 'subway'], '#673AB7', // Deep purple for subway
              ['==', ['get', 'railway'], 'rail'], '#9C27B0', // Purple for rail
              '#BA68C8' // Light purple for other railways
            ],
            'line-width': [
              'case',
              ['==', ['get', 'railway'], 'subway'], 3,
              ['==', ['get', 'railway'], 'rail'], 2.5,
              2
            ],
            'line-opacity': 0.9
          }
        },
        // Borough boundaries - bold lines
        {
          id: 'nyc-boundaries',
          type: 'line' as const,
          source: 'nyc-data',
          filter: [
            'any',
            ['==', ['get', 'admin_level'], '6'],
            ['==', ['get', 'boundary'], 'administrative']
          ],
          paint: {
            'line-color': '#E91E63', // Pink for boundaries
            'line-width': 3,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2]
          }
        },
        // Labels
        {
          id: 'nyc-labels',
          type: 'symbol' as const,
          source: 'nyc-data',
          filter: ['has', 'name'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': [
              'case',
              ['==', ['get', 'place'], 'borough'], 16,
              ['==', ['get', 'place'], 'neighbourhood'], 14,
              12
            ],
            'text-anchor': 'center',
            'text-offset': [0, 1]
          },
          paint: {
            'text-color': '#212121',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 2
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
    if (!mapRef.current || map) return; // Prevent re-initialization if map already exists
    
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

        // Create map with enhanced GeoJSON style
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
          console.log('MapLibre: Map loaded with enhanced NYC styling');
          
          // Debug: Log what layers are loaded
          const style = mapInstance!.getStyle();
          console.log('Loaded layers:', style.layers.map(l => l.id));
          
          if (!isCleanedUp) {
            onMapLoad?.(mapInstance);
          }
        });

        // Error handling
        mapInstance.on('error', (e) => {
          console.error('MapLibre: Map error:', e);
        });

        // Debug: Log style loading events
        mapInstance.on('styledata', () => {
          console.log('Style data loaded');
        });

        mapInstance.on('sourcedata', (e) => {
          if (e.sourceId === 'nyc-data' && e.isSourceLoaded) {
            console.log('NYC GeoJSON source loaded successfully');
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
        // Could add cluster markers here
      } else {
        // Create individual business marker with enhanced styling
        const el = document.createElement('div');
        el.className = 'business-marker';
        el.style.cssText = `
          background: #FF4081;
          border: 2px solid #E91E63;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          cursor: pointer;
          box-shadow: 0 3px 6px rgba(233, 30, 99, 0.4);
          transition: all 0.2s ease;
        `;
        
        // Add hover effect
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.2)';
          el.style.boxShadow = '0 4px 8px rgba(233, 30, 99, 0.6)';
        });
        
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 3px 6px rgba(233, 30, 99, 0.4)';
        });
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        // Add click handler
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Business marker clicked:', cluster.properties.business);
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
          // Cluster markers (could be implemented)
        } else {
          const el = document.createElement('div');
          el.className = 'business-marker';
          el.style.cssText = `
            background: #FF4081;
            border: 2px solid #E91E63;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            cursor: pointer;
            box-shadow: 0 3px 6px rgba(233, 30, 99, 0.4);
            transition: all 0.2s ease;
          `;
          
          el.addEventListener('mouseenter', () => {
            el.style.transform = 'scale(1.2)';
            el.style.boxShadow = '0 4px 8px rgba(233, 30, 99, 0.6)';
          });
          
          el.addEventListener('mouseleave', () => {
            el.style.transform = 'scale(1)';
            el.style.boxShadow = '0 3px 6px rgba(233, 30, 99, 0.4)';
          });

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Business marker clicked (updated):', cluster.properties.business);
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