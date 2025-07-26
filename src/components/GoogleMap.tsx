import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { usePerformanceMode } from '../hooks/usePerformanceMode';

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
  loadBusinessChunk?: (areaIndex: number) => void;
}

const GoogleMap: React.FC<GoogleMapProps> = ({ onMapLoad, businesses = [], onBusinessClick, selectedBusiness, loadBusinessChunk }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markerClusterer, setMarkerClusterer] = useState<MarkerClusterer | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const [isMapReady, setIsMapReady] = useState(false);
  const { shouldReduceMotion } = usePerformanceMode();
  
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

  // Stable map initialization - only run once
  useEffect(() => {
    if (!mapRef.current || map || isMapReady) {
      return;
    }
    const loadGoogleMapsScript = () => {
      return new Promise<void>((resolve, reject) => {
        // Check if Google Maps is already loaded and ready
        if (window.google && window.google.maps && window.google.maps.Map) {
          resolve();
          return;
        }

        // Check if script is already loading
        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
          existingScript.addEventListener('load', () => {
            // Wait a bit more for the API to be fully ready
            setTimeout(() => {
              if (window.google && window.google.maps && window.google.maps.Map) {
                resolve();
              } else {
                reject(new Error('Google Maps API not ready after script load'));
              }
            }, 100);
          });
          existingScript.addEventListener('error', reject);
          return;
        }

        // Create and load the script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ&libraries=places&v=weekly&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;
        
        // Set up callback function
        (window as any).initGoogleMaps = () => {
          console.log('Google Maps callback executed');
          resolve();
        };
        
        script.addEventListener('error', (error) => {
          console.error('Failed to load Google Maps script:', error);
          reject(error);
        });
        document.head.appendChild(script);
      });
    };

    const initMap = async () => {
      console.log('Initializing map...');
      
      if (!mapRef.current) {
        console.error('Map container ref is not available');
        return;
      }

      console.log('Map container dimensions:', {
        width: mapRef.current.offsetWidth,
        height: mapRef.current.offsetHeight,
        clientWidth: mapRef.current.clientWidth,
        clientHeight: mapRef.current.clientHeight
      });

      try {
        await loadGoogleMapsScript();
        console.log('Google Maps API loaded');
        
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
          // Reduce animation complexity for low-performance devices
          gestureHandling: shouldReduceMotion ? 'cooperative' : 'greedy',
          disableDefaultUI: true,
          backgroundColor: '#1a1a1a',
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
            {
              featureType: 'administrative.locality',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d59563' }]
            },
            {
              featureType: 'poi',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d59563' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'geometry',
              stylers: [{ color: '#263c3f' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#6b9a76' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ color: '#38414e' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#212a37' }]
            },
            {
              featureType: 'road',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#9ca5b3' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry',
              stylers: [{ color: '#746855' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#1f2835' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#f3d19c' }]
            },
            {
              featureType: 'transit',
              elementType: 'geometry',
              stylers: [{ color: '#2f3948' }]
            },
            {
              featureType: 'transit.station',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d59563' }]
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#17263c' }]
            },
            {
              featureType: 'water',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#515c6d' }]
            },
            {
              featureType: 'water',
              elementType: 'labels.text.stroke',
              stylers: [{ color: '#17263c' }]
            }
          ]
        });

        console.log('Google Map instance created successfully');

        // Add throttled zoom change listener
        const zoomHandler = throttledZoomChange();
        mapInstance.addListener('zoom_changed', zoomHandler);

        // Add lazy loading listener for viewport changes
        if (loadBusinessChunk) {
          mapInstance.addListener('bounds_changed', () => {
            const bounds = mapInstance.getBounds();
            if (!bounds) return;

            // Define NYC area boundaries for each chunk
            const areas = [
              { index: 0, bounds: { north: 40.8, south: 40.75, east: -73.95, west: -74.02 } }, // Manhattan
              { index: 1, bounds: { north: 40.7, south: 40.64, east: -73.92, west: -74.02 } }, // Brooklyn
              { index: 2, bounds: { north: 40.75, south: 40.7, east: -73.75, west: -73.85 } }, // Queens
              { index: 3, bounds: { north: 40.88, south: 40.8, east: -73.82, west: -73.92 } }, // Bronx
              { index: 4, bounds: { north: 40.62, south: 40.55, east: -74.1, west: -74.2 } }  // Staten Island
            ];

            // Check which areas are in viewport and load them
            areas.forEach(area => {
              const areaInView = bounds.intersects(new google.maps.LatLngBounds(
                new google.maps.LatLng(area.bounds.south, area.bounds.west),
                new google.maps.LatLng(area.bounds.north, area.bounds.east)
              ));
              
              if (areaInView) {
                loadBusinessChunk(area.index);
              }
            });
          });
        }

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
      style={{ 
        zIndex: -1,
        minHeight: '100vh',
        minWidth: '100vw',
        touchAction: 'manipulation'
      }}
    />
  );
};

export default GoogleMap;