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

  // NYC bounds for the static image
  const NYC_BOUNDS = {
    southwest: [-74.2557, 40.4960], // Staten Island
    northeast: [-73.7004, 40.9152], // Bronx
    center: [-73.9712, 40.7831]
  };

  // Handle zoom change
  const handleZoomChange = useCallback(() => {
    if (map) {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
    }
  }, []);

  // Create a simple map style with static image background
  const createStaticImageStyle = (): maplibregl.StyleSpecification => {
    return {
      version: 8 as const,
      sources: {
        'nyc-raster': {
          type: 'raster' as const,
          tiles: [
            // You can use OpenStreetMap tiles (no API key needed)
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'nyc-background',
          type: 'raster' as const,
          source: 'nyc-raster',
          minzoom: 0,
          maxzoom: 22,
          paint: {
            // Apply filters to make roads appear as #CCCCCC
            'raster-brightness-min': 0.8,
            'raster-brightness-max': 1.2,
            'raster-contrast': 0.3,
            'raster-saturation': 0.1, // Desaturate to make it more gray
            'raster-hue-rotate': 0
          }
        }
      ]
    };
  };

  // Alternative: Use a completely custom style with your own image
  const createCustomImageStyle = (imageUrl: string): maplibregl.StyleSpecification => {
    return {
      version: 8 as const,
      sources: {
        'nyc-image': {
          type: 'image' as const,
          url: imageUrl,
          coordinates: [
            [NYC_BOUNDS.southwest[0], NYC_BOUNDS.northeast[1]], // top-left
            [NYC_BOUNDS.northeast[0], NYC_BOUNDS.northeast[1]], // top-right
            [NYC_BOUNDS.northeast[0], NYC_BOUNDS.southwest[1]], // bottom-right
            [NYC_BOUNDS.southwest[0], NYC_BOUNDS.southwest[1]]  // bottom-left
          ]
        }
      },
      layers: [
        {
          id: 'nyc-image-layer',
          type: 'raster' as const,
          source: 'nyc-image',
          paint: {
            // Apply color filters to make roads #CCCCCC
            'raster-brightness-min': 0.7,
            'raster-brightness-max': 1.3,
            'raster-contrast': 0.4,
            'raster-saturation': 0.2,
            'raster-opacity': 1
          }
        }
      ]
    };
  };

  // Initialize map with static image style
  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      // Use the static image style (no API key needed)
      style: createStaticImageStyle(),
      // Alternative: If you have your own NYC image, use this instead:
      // style: createCustomImageStyle('path/to/your/nyc-image.png'),
      center: NYC_BOUNDS.center as [number, number],
      zoom: 11,
      maxBounds: [
        NYC_BOUNDS.southwest,
        NYC_BOUNDS.northeast
      ] as [[number, number], [number, number]]
    });

    // Add zoom change listener
    const zoomHandler = () => {
      const zoom = mapInstance.getZoom();
      setCurrentZoom(zoom);
    };
    mapInstance.on('zoom', zoomHandler);

    // Add custom CSS filter to the map container for additional color control
    mapInstance.on('load', () => {
      const canvas = mapInstance.getCanvas();
      
      // Apply CSS filters to shift colors toward #CCCCCC for roads
      canvas.style.filter = `
        contrast(0.8) 
        brightness(1.1) 
        saturate(0.3) 
        sepia(0.1) 
        hue-rotate(200deg)
      `;

      console.log('Static NYC map loaded');
      onMapLoad?.(mapInstance);
    });

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
    };
  }, [onMapLoad]);

  // Create marker clustering (same as before)
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
      
      if (!cluster.properties.cluster) {
        // Create individual business marker
        const el = document.createElement('div');
        el.className = 'business-marker';
        el.style.cssText = `
          background: #FFEB3B;
          border: 2px solid #FFC107;
          border-radius: 50%;
          width: 14px;
          height: 14px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          transition: all 0.2s ease;
        `;
        
        // Add hover effect
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.2)';
          el.style.zIndex = '1000';
        });
        
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          el.style.zIndex = 'auto';
        });

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
            width: 14px;
            height: 14px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            transition: all 0.2s ease;
          `;
          
          el.addEventListener('mouseenter', () => {
            el.style.transform = 'scale(1.2)';
            el.style.zIndex = '1000';
          });
          
          el.addEventListener('mouseleave', () => {
            el.style.transform = 'scale(1)';
            el.style.zIndex = 'auto';
          });

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