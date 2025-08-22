import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibreMapProps {
  businesses: {
    id: string;
    name: string;
    position: { lat: number; lng: number };
    atmosphere: string[];
    salary?: string;
    stories?: { id: string; text: string; author: string }[];
    businessType?: string;
    roles?: {
      role: string;
      salary: string;
      upvotes?: number;
      downvotes?: number;
      userVote?: 'up' | 'down';
    }[];
    place_id?: string;
  }[];
  onBusinessClick?: (business: any) => void;
  selectedBusiness?: any;
  landmarks?: { lat: number; lng: number; emoji: string }[];
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({
  businesses,
  onBusinessClick,
  selectedBusiness,
  landmarks = []
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'pmtiles': {
            type: 'vector',
            url: 'pmtiles:///data/neatogeo_nyc.pmtiles'
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#f8f8f8'
            }
          },
          {
            id: 'water',
            type: 'fill',
            source: 'pmtiles',
            'source-layer': 'water',
            paint: {
              'fill-color': '#a8d8ea'
            }
          },
          {
            id: 'landuse',
            type: 'fill',
            source: 'pmtiles',
            'source-layer': 'landuse',
            paint: {
              'fill-color': '#e8f5e8'
            }
          },
          {
            id: 'roads',
            type: 'line',
            source: 'pmtiles',
            'source-layer': 'transportation',
            paint: {
              'line-color': '#ffffff',
              'line-width': 2
            }
          }
        ]
      },
      center: [-73.986104, 40.715245], // NYC center
      zoom: 12
    });

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
      setMap(null);
    };
  }, []);

  // Add business markers
  useEffect(() => {
    if (!map || !businesses.length) return;

    // Add business markers as simple HTML markers
    const markers: maplibregl.Marker[] = [];
    
    businesses.forEach(business => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 20px;
        height: 20px;
        background-color: ${selectedBusiness?.id === business.id ? '#ff0000' : '#ffaa00'};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;
      
      el.addEventListener('click', () => {
        if (onBusinessClick) {
          onBusinessClick(business);
        }
      });

      const marker = new maplibregl.Marker(el)
        .setLngLat([business.position.lng, business.position.lat])
        .addTo(map);
      
      markers.push(marker);
    });

    return () => {
      markers.forEach(marker => marker.remove());
    };
  }, [map, businesses, selectedBusiness, onBusinessClick]);

  // Add landmark emojis
  useEffect(() => {
    if (!map || !landmarks.length) return;

    const markers: maplibregl.Marker[] = [];
    
    landmarks.forEach(landmark => {
      const el = document.createElement('div');
      el.textContent = landmark.emoji;
      el.style.cssText = `
        font-size: 24px;
        cursor: default;
        user-select: none;
        text-shadow: 0 0 3px rgba(255,255,255,0.9);
      `;

      const marker = new maplibregl.Marker(el)
        .setLngLat([landmark.lng, landmark.lat])
        .addTo(map);
      
      markers.push(marker);
    });

    return () => {
      markers.forEach(marker => marker.remove());
    };
  }, [map, landmarks]);

  return (
    <div
      ref={mapRef}
      style={{ 
        width: '100%',
        height: '100%',
        backgroundColor: '#f0f0f0'
      }}
    />
  );
};

export default MapLibreMap;