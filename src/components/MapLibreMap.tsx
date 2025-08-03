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
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const clusterRef = useRef<Supercluster | null>(null);
  
  const MARKER_VISIBILITY_ZOOM_THRESHOLD = 13;

  // Handle zoom change
  const handleZoomChange = useCallback(() => {
    if (map) {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'openmaptiles': {
            type: 'vector',
            tiles: [
              'https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=get_your_own_OpIi9ZULNHzrESv6T2vL'
            ],
            attribution: '© MapTiler © OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#f8f9fa'
            }
          },
          // Water layers with custom color
          {
            id: 'water',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'water',
            paint: {
              'fill-color': '#04AEF6'
            }
          },
          {
            id: 'waterway',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'waterway',
            paint: {
              'line-color': '#04AEF6',
              'line-width': [
                'interpolate',
                ['exponential', 1.4],
                ['zoom'],
                8, 1,
                20, 8
              ]
            }
          },
          // Parks and green spaces with custom color
          {
            id: 'parks',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'landuse',
            filter: ['in', 'class', 'park', 'cemetery', 'recreation_ground'],
            paint: {
              'fill-color': '#8BCE64',
              'fill-opacity': 0.8
            }
          },
          {
            id: 'landcover-grass',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'landcover',
            filter: ['==', 'class', 'grass'],
            paint: {
              'fill-color': '#8BCE64',
              'fill-opacity': 0.6
            }
          },
          // Buildings
          {
            id: 'buildings',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'building',
            paint: {
              'fill-color': '#e0e0e0',
              'fill-opacity': 0.7
            }
          },
          {
            id: 'buildings-outline',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'building',
            paint: {
              'line-color': '#d0d0d0',
              'line-width': 1
            }
          },
          // Roads
          {
            id: 'roads-minor',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            filter: ['in', 'class', 'minor', 'service'],
            paint: {
              'line-color': '#ffffff',
              'line-width': [
                'interpolate',
                ['exponential', 1.55],
                ['zoom'],
                4, 0.25,
                20, 30
              ]
            }
          },
          {
            id: 'roads-major',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            filter: ['in', 'class', 'primary', 'secondary', 'tertiary', 'trunk'],
            paint: {
              'line-color': '#ffffff',
              'line-width': [
                'interpolate',
                ['exponential', 1.4],
                ['zoom'],
                6, 0.5,
                20, 30
              ]
            }
          },
          {
            id: 'roads-highway',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            filter: ['==', 'class', 'motorway'],
            paint: {
              'line-color': '#fc8',
              'line-width': [
                'interpolate',
                ['exponential', 1.4],
                ['zoom'],
                8, 1,
                16, 10
              ]
            }
          },
          // Labels
          {
            id: 'place-labels',
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'place',
            filter: ['==', 'class', 'city'],
            layout: {
              'text-field': '{name}',
              'text-font': ['Open Sans Regular'],
              'text-size': 16
            },
            paint: {
              'text-color': '#333',
              'text-halo-color': '#fff',
              'text-halo-width': 2
            }
          }
        ]
      },
      center: [-73.9712, 40.7831], // NYC center
      zoom: 14,
      maxBounds: [
        [-74.2557, 40.4960], // Southwest corner (Staten Island)
        [-73.7004, 40.9152]  // Northeast corner (Bronx)
      ]
    });

    // Add zoom change listener
    const zoomHandler = () => {
      const zoom = mapInstance.getZoom();
      setCurrentZoom(zoom);
    };
    mapInstance.on('zoom', zoomHandler);

    // Apply minimal custom styling when map loads
    mapInstance.on('load', () => {
      onMapLoad?.(mapInstance);
    });

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
    };
  }, []);

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
        // Create cluster marker
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

        // // Zoom to cluster on click
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
          const el = document.createElement('div');
          el.className = 'cluster-marker';
          el.style.cssText = `
            background: hsl(var(--primary));
            border: 2px solid hsl(var(--primary-foreground));
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: hsl(var(--primary-foreground));
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
          `;
          el.textContent = cluster.properties.point_count_abbreviated;
          
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

          el.addEventListener('click', () => {
            const expansionZoom = clusterRef.current?.getClusterExpansionZoom(cluster.properties.cluster_id);
            map.easeTo({
              center: [lng, lat],
              zoom: expansionZoom || currentZoom + 2
            });
          });

          updatedMarkers.push(marker);
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
      style={{ 
        zIndex: 1,
      }}
    />
  );
};

export default MapLibreMap;