import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

interface GoogleMapProps {
  onMapLoad?: (map: google.maps.Map) => void;
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

const GoogleMap: React.FC<GoogleMapProps> = ({ onMapLoad, businesses = [], onBusinessClick, selectedBusiness }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markerClusterer, setMarkerClusterer] = useState<MarkerClusterer | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  
  const MARKER_VISIBILITY_ZOOM_THRESHOLD = 13;

  // Throttled zoom change handler for better performance
  const throttledZoomChange = useCallback(() => {
    let timeoutId: NodeJS.Timeout;
    return () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (map) {
          const zoom = map.getZoom() || 14;
          setCurrentZoom(zoom);
        }
      }, 100);
    };
  }, [map]);

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;

      const loader = new Loader({
        apiKey: 'AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ',
        version: 'weekly',
        libraries: ['places']
      });

      try {
        await loader.load();
        
        // Tighter bounds for NYC 5 boroughs only
        const nycBounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(40.4960, -74.2557), // Southwest corner (tighter Staten Island)
          new google.maps.LatLng(40.9152, -73.7004)  // Northeast corner (tighter Bronx)
        );
        
        const mapInstance = new google.maps.Map(mapRef.current, {
          center: { lat: 40.7831, lng: -73.9712 }, // NYC center
          zoom: 14,
          restriction: {
            latLngBounds: nycBounds,
            strictBounds: true
          },
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            }
          ],
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          scaleControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false
        });

        // Add throttled zoom change listener
        const zoomHandler = throttledZoomChange();
        mapInstance.addListener('zoom_changed', zoomHandler);

        setMap(mapInstance);
        onMapLoad?.(mapInstance);
      } catch (error) {
        console.error('Error loading Google Maps:', error);
      }
    };

    initMap();
  }, [onMapLoad, throttledZoomChange]);

  // Add business markers with clustering and zoom-based visibility
  useEffect(() => {
    if (!map || !businesses.length) return;

    // Clear existing clusterer
    if (markerClusterer) {
      markerClusterer.clearMarkers();
      setMarkerClusterer(null);
    }

    // Only show markers if zoom level is above threshold
    if (currentZoom < MARKER_VISIBILITY_ZOOM_THRESHOLD) {
      return;
    }

    // Filter businesses to viewport for performance
    const bounds = map.getBounds();
    const visibleBusinesses = bounds ? businesses.filter(business => 
      bounds.contains(new google.maps.LatLng(business.position.lat, business.position.lng))
    ) : businesses;

    const markers = visibleBusinesses.map(business => {
      const marker = new google.maps.Marker({
        position: business.position,
        title: business.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#FFEB3B',
          fillOpacity: 1,
          strokeColor: '#FFC107',
          strokeWeight: 1
        }
      });

      marker.addListener('click', () => {
        onBusinessClick?.(business);
      });

      return marker;
    });

    // Create marker clusterer with simple configuration
    const clusterer = new MarkerClusterer({ 
      map, 
      markers
    });

    setMarkerClusterer(clusterer);

    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
      }
    };
  }, [map, businesses, onBusinessClick, currentZoom]);

  // Add occasional confetti bursts
  useEffect(() => {
    if (!map) return;

    const addConfettiBurst = () => {
      const bounds = map.getBounds();
      if (!bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      
      const randomLat = sw.lat() + Math.random() * (ne.lat() - sw.lat());
      const randomLng = sw.lng() + Math.random() * (ne.lng() - sw.lng());

      const confettiMarker = new google.maps.Marker({
        position: { lat: randomLat, lng: randomLng },
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 4,
          fillColor: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][Math.floor(Math.random() * 5)],
          fillOpacity: 0.8,
          strokeWeight: 0
        },
        animation: google.maps.Animation.DROP
      });

      // Remove after animation
      setTimeout(() => {
        confettiMarker.setMap(null);
      }, 2000);
    };

    const interval = setInterval(addConfettiBurst, 8000 + Math.random() * 7000);
    return () => clearInterval(interval);
  }, [map]);

  // Center map on selected business with proper navigation
  useEffect(() => {
    if (!map || !selectedBusiness?.position) return;
    
    // Use panTo and setZoom for smoother animation
    map.panTo(selectedBusiness.position);
    map.setZoom(16);
  }, [map, selectedBusiness]);

  return (
    <div 
      ref={mapRef} 
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 1 }}
    />
  );
};

export default GoogleMap;