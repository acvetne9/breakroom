import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader } from '@googlemaps/js-api-loader';
import { MapPin, Filter, Search } from 'lucide-react';

interface InitiationPageProps {
  onComplete: (data: { salary: string; role: string; location: string }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({ onComplete }) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [businessSearch, setBusinessSearch] = useState('');
  const [selectedBusinessType, setSelectedBusinessType] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchResults, setSearchResults] = useState<google.maps.places.PlaceResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const businessSearchRef = useRef<HTMLInputElement>(null);
  const autocompleteInstance = useRef<google.maps.places.Autocomplete | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const businessTypes = [
    'restaurant', 'cafe', 'store', 'gym', 'bank', 'hospital', 'pharmacy', 
    'gas_station', 'supermarket', 'shopping_mall', 'beauty_salon', 'bakery',
    'clothing_store', 'electronics_store', 'hair_care', 'laundry'
  ];

  const locationFilters = [
    'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island',
    'Times Square', 'SoHo', 'Chelsea', 'Upper East Side', 'Lower East Side'
  ];

  const handleSalaryChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, '');
    setSalary(cleanValue ? `$${cleanValue}` : '');
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUseCurrentLocation(true);
          setSelectedLocation('Current Location');
          searchNearbyBusinesses(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('Error getting current location:', error);
        }
      );
    }
  };

  const searchNearbyBusinesses = (lat: number, lng: number) => {
    if (!placesService.current) return;

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: 2000,
      type: selectedBusinessType || undefined,
      keyword: businessSearch || undefined
    };

    placesService.current.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setSearchResults(results.slice(0, 10));
      }
    });
  };

  const searchBusinessesByQuery = () => {
    if (!placesService.current || !businessSearch) return;

    const request: google.maps.places.TextSearchRequest = {
      query: `${businessSearch} ${selectedBusinessType ? selectedBusinessType : ''} ${selectedLocation || 'NYC'}`,
      location: new google.maps.LatLng(40.7128, -74.0060), // NYC center
      radius: 50000
    };

    placesService.current.textSearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setSearchResults(results.slice(0, 10));
      }
    });
  };

  const selectBusiness = (business: google.maps.places.PlaceResult) => {
    if (business.name) {
      setLocation(business.name);
      setBusinessSearch(business.name);
      handleFieldBlur();
    }
  };

  useEffect(() => {
    const initGoogleMaps = async () => {
      const loader = new Loader({
        apiKey: 'AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ',
        version: 'weekly',
        libraries: ['places']
      });

      try {
        await loader.load();
        
        // Create a hidden map for places service
        const mapDiv = document.createElement('div');
        mapRef.current = new google.maps.Map(mapDiv, {
          center: { lat: 40.7128, lng: -74.0060 },
          zoom: 13
        });
        placesService.current = new google.maps.places.PlacesService(mapRef.current);

        // NYC bounds
        const nycBounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(40.4774, -74.2591),
          new google.maps.LatLng(40.9176, -73.7004)
        );

        if (autocompleteRef.current) {
          autocompleteInstance.current = new google.maps.places.Autocomplete(
            autocompleteRef.current,
            {
              bounds: nycBounds,
              strictBounds: true,
              types: ['establishment', 'geocode'],
              componentRestrictions: { country: 'us' }
            }
          );

          autocompleteInstance.current.addListener('place_changed', () => {
            const place = autocompleteInstance.current?.getPlace();
            if (place?.name) {
              setLocation(place.name);
              handleFieldBlur();
            }
          });
        }
      } catch (error) {
        console.error('Error loading Google Places:', error);
      }
    };

    initGoogleMaps();
  }, []);

  useEffect(() => {
    if (businessSearch && (selectedBusinessType || selectedLocation)) {
      const timeoutId = setTimeout(() => {
        if (useCurrentLocation && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              searchNearbyBusinesses(position.coords.latitude, position.coords.longitude);
            }
          );
        } else {
          searchBusinessesByQuery();
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [businessSearch, selectedBusinessType, selectedLocation]);

  const handleFieldBlur = () => {
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    
    if (allFilled && !isComplete) {
      setIsComplete(true);
      setTimeout(() => {
        onComplete({ salary, role, location });
      }, 300);
    }
  };

  return (
    <motion.div
      initial={{ y: 0 }}
      animate={{ y: isComplete ? '-100vh' : 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="absolute inset-0 z-50 flex items-center justify-center"
    >
      <div className="app-card flex flex-col justify-center px-8 py-12 max-h-[90vh] overflow-y-auto">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-lg font-medium text-app-black mb-6">
              Real Info. Real Fast.
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={salary}
                onChange={(e) => handleSalaryChange(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="$14"
                className="app-input text-center text-lg"
              />
              <div className="text-center mt-2">
                <span className="text-sm text-app-gray-medium">HR</span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-app-black mb-4">3 Easy Questions.</p>
            </div>

            <div>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="Barista"
                className="app-input"
              />
            </div>

            <div className="text-center">
              <p className="text-sm text-app-black mb-4">Find businesses, industries...</p>
            </div>

            {/* Business Search Section */}
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-app-gray-medium" />
                <input
                  ref={businessSearchRef}
                  type="text"
                  value={businessSearch}
                  onChange={(e) => setBusinessSearch(e.target.value)}
                  placeholder="Search businesses, industries..."
                  className="app-input pl-10"
                />
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <Filter className="w-4 h-4 text-app-gray-medium" />
                </button>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="space-y-4 p-4 bg-app-gray-light/30 rounded-lg">
                  <div>
                    <label className="text-sm text-app-black mb-2 block">Business Type</label>
                    <select
                      value={selectedBusinessType}
                      onChange={(e) => setSelectedBusinessType(e.target.value)}
                      className="w-full px-3 py-2 border border-app-gray-light rounded-lg bg-white text-sm"
                    >
                      <option value="">All Types</option>
                      {businessTypes.map(type => (
                        <option key={type} value={type}>
                          {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-app-black mb-2 block">Location</label>
                    <div className="space-y-2">
                      <button
                        onClick={getCurrentLocation}
                        className={`w-full px-3 py-2 rounded-lg text-sm flex items-center justify-center space-x-2 ${
                          useCurrentLocation 
                            ? 'bg-app-yellow text-app-black' 
                            : 'bg-app-gray-light text-app-gray-medium'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                        <span>In my area</span>
                      </button>
                      <select
                        value={selectedLocation}
                        onChange={(e) => {
                          setSelectedLocation(e.target.value);
                          setUseCurrentLocation(false);
                        }}
                        className="w-full px-3 py-2 border border-app-gray-light rounded-lg bg-white text-sm"
                        disabled={useCurrentLocation}
                      >
                        <option value="">Select Area</option>
                        {locationFilters.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border border-app-gray-light rounded-lg p-2">
                  {searchResults.map((business, index) => (
                    <button
                      key={index}
                      onClick={() => selectBusiness(business)}
                      className="w-full text-left p-2 hover:bg-app-gray-light/50 rounded text-sm"
                    >
                      <div className="font-medium">{business.name}</div>
                      <div className="text-app-gray-medium text-xs">{business.formatted_address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm text-app-black mb-4">Understand Neighborhood Income Trends.</p>
            </div>

            <div>
              <input
                ref={autocompleteRef}
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={handleFieldBlur}
                placeholder="Search NYC locations..."
                className="app-input"
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-sm text-app-black">Grow Your Community.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InitiationPage;