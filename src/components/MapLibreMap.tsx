import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PMTiles, Protocol } from 'pmtiles';

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

    // Register PMTiles protocol
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    console.log('PMTiles protocol registered');

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'pmtiles': {
            type: 'vector',
            url: 'pmtiles://data/neatogeo_nyc.pmtiles'
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

    // Add error handling and debugging
    mapInstance.on('error', (e) => {
      console.error('Map error:', e);
    });

    mapInstance.on('sourcedata', (e) => {
      if (e.sourceId === 'pmtiles') {
        console.log('PMTiles source loaded:', e);
      }
    });

    mapInstance.on('load', () => {
      console.log('Map loaded successfully');
    });

    return () => {
      maplibregl.removeProtocol('pmtiles');
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
        width: 24px;
        height: 24px;
        background: ${selectedBusiness?.id === business.id ? 
          'linear-gradient(135deg, #ff4444, #cc0000)' : 
          'linear-gradient(135deg, #4CAF50, #2E7D32)'};
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
        font-weight: bold;
        transition: all 0.2s ease;
      `;
      el.textContent = '🏢';
      
      el.addEventListener('click', () => {
        if (onBusinessClick) {
          onBusinessClick(business);
        }
      });

      el.className = 'hover-scale';
      el.textContent = '🏢';

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
        font-size: 32px;
        cursor: default;
        user-select: none;
        text-shadow: 0 0 8px rgba(255,255,255,0.9), 0 0 16px rgba(0,0,0,0.3);
        filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
        transform: scale(1);
        transition: transform 0.2s ease;
      `;
      
      el.className = 'hover-scale';
      
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });

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