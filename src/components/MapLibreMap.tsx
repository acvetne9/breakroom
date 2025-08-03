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
          'openfreemap': {
            type: 'vector',
            tiles: [
              'https://tiles.openfreemap.org/data/v3/{z}/{x}/{y}.pbf'
            ],
            attribution: '© OpenFreeMap © OpenStreetMap contributors'
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
          // Water with custom color
          {
            id: 'water',
            type: 'fill',
            source: 'openfreemap',
            'source-layer': 'water',
            paint: {
              'fill-color': '#04AEF6'
            }
          },
          // Parks and green spaces with custom color
          {
            id: 'parks',
            type: 'fill',
            source: 'openfreemap',
            'source-layer': 'landuse',
            filter: ['in', ['get', 'class'], ['literal', ['park', 'cemetery', 'recreation_ground', 'forest', 'grass', 'meadow', 'recreation']]],
            paint: {
              'fill-color': '#8BCE64',
              'fill-opacity': 0.8
            }
          },
          // Additional green areas
          {
            id: 'landcover',
            type: 'fill',
            source: 'openfreemap',
            'source-layer': 'landcover',
            filter: ['in', ['get', 'class'], ['literal', ['grass', 'forest', 'wood']]],
            paint: {
              'fill-color': '#8BCE64',
              'fill-opacity': 0.6
            }
          },
          // Buildings
          {
            id: 'buildings',
            type: 'fill',
            source: 'openfreemap',
            'source-layer': 'building',
            paint: {
              'fill-color': '#e0e0e0',
              'fill-opacity': 0.7
            }
          },
          // Roads
          {
            id: 'roads-case',
            type: 'line',
            source: 'openfreemap',
            'source-layer': 'transportation',
            paint: {
              'line-color': '#ffffff',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5, 0.4,
                18, 20
              ]
            }
          },
          // Waterways
          {
            id: 'waterway',
            type: 'line',
            source: 'openfreemap',
            'source-layer': 'waterway',
            paint: {
              'line-color': '#04AEF6',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 1,
                16, 4
              ]
            }
          },
          // Place labels
          {
            id: 'place-labels',
            type: 'symbol',
            source: 'openfreemap',
            'source-layer': 'place',
            filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 14,
              'text-offset': [0, 0]
            },
            paint: {
              'text-color': '#333',
              'text-halo-color': '#fff',
              'text-halo-width': 1
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

    // Handle source errors gracefully
    mapInstance.on('sourcedataabort', (e) => {
      console.log('Source data loading aborted:', e);
    });

    mapInstance.on('error', (e) => {
      console.log('Map error:', e);
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