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
          'osm-raster': {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
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
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 22
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
    <div className="absolute inset-0 w-full h-full">
      <div 
        ref={mapRef} 
        className="absolute inset-0 w-full h-full"
        style={{ 
          zIndex: 1,
        }}
      />
      
      {/* Custom color overlay using CSS */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          zIndex: 2,
          background: `
            radial-gradient(circle at 40.7831% 26.0288%, rgba(4, 174, 246, 0.3) 0%, transparent 15%),
            radial-gradient(circle at 40.7515% 26.0421%, rgba(139, 206, 100, 0.2) 0%, transparent 10%),
            radial-gradient(circle at 40.7645% 26.0156%, rgba(139, 206, 100, 0.25) 0%, transparent 12%),
            radial-gradient(circle at 40.7421% 26.0512%, rgba(4, 174, 246, 0.4) 0%, transparent 8%),
            radial-gradient(circle at 40.7812% 26.0089%, rgba(139, 206, 100, 0.2) 0%, transparent 14%)
          `,
          mixBlendMode: 'multiply'
        }}
      />
      
      <style>{`
        .maplibregl-canvas-container canvas {
          filter: hue-rotate(15deg) saturate(1.3) brightness(1.05) !important;
        }
      `}</style>
    </div>
  );
};

export default MapLibreMap;