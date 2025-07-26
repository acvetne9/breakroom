
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader } from '@googlemaps/js-api-loader';
import JobSearchDropdown from './JobSearchDropdown';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';

// Import the predefined job options to check against
const JOB_OPTIONS = [
  'Barista',
  'Server', 
  'Cook',
  'Cashier',
  'Security Guard',
  'Retail Associate',
  'Delivery Driver',
  'Host/Hostess',
  'Cleaner',
  'Stock Associate',
  'Customer Service',
  'Manager',
  'Waiter/Waitress',
  'Receptionist',
  'Sales Associate',
  'Food Service Worker',
  'Maintenance',
  'Supervisor',
  'Shift Leader',
  'Assistant Manager'
];

interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    timePeriod: string;
  }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({
  onComplete
}) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [isComplete, setIsComplete] = useState(false);
  const [isGooglePlacesSelected, setIsGooglePlacesSelected] = useState(false);
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const autocompleteInstance = useRef<google.maps.places.Autocomplete | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const { toast } = useToast();

  const handleSalaryChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, '');
    setSalary(cleanValue ? `$${cleanValue}` : '');
  };

  useEffect(() => {
    const initAutocomplete = async () => {
      if (!autocompleteRef.current) return;
      const loader = new Loader({
        apiKey: 'AIzaSyCkLj9I2chNXHkMTbBO0k-KkEmnc_jAqyQ',
        version: 'weekly',
        libraries: ['places']
      });
      try {
        await loader.load();

        // Initialize services
        autocompleteService.current = new google.maps.places.AutocompleteService();
        
        // Create a map for PlacesService (hidden)
        const mapDiv = document.createElement('div');
        const map = new google.maps.Map(mapDiv, {
          center: { lat: 40.7128, lng: -74.0060 },
          zoom: 13
        });
        placesService.current = new google.maps.places.PlacesService(map);

        // NYC bounds
        const nycBounds = new google.maps.LatLngBounds(new google.maps.LatLng(40.4774, -74.2591), new google.maps.LatLng(40.9176, -73.7004));
        autocompleteInstance.current = new google.maps.places.Autocomplete(autocompleteRef.current, {
          bounds: nycBounds,
          strictBounds: true,
          types: ['establishment', 'geocode'],
          componentRestrictions: {
            country: 'us'
          }
        });
        
        autocompleteInstance.current.addListener('place_changed', () => {
          const place = autocompleteInstance.current?.getPlace();
          console.log('Google Places selected:', place);
          if (place?.name) {
            const placeName = place.name;
            const fullAddr = place.formatted_address || place.name;
            
            console.log('Setting location from Google Places:', placeName, 'Full address:', fullAddr);
            setLocation(placeName);
            setFullLocation(fullAddr);
            setIsGooglePlacesSelected(true);
            
            // Wait a tick before triggering completion check
            setTimeout(() => {
              checkForCompletion();
            }, 10);
          }
        });
      } catch (error) {
        console.error('Error loading Google Places:', error);
      }
    };
    initAutocomplete();
  }, []);
  
  // Centralized completion effect with proper data validation
  useEffect(() => {
    if (isComplete) {
      // Validate that all required data is present
      const dataToPass = { salary, role, location, fullLocation, timePeriod };
      console.log('InitiationPage completing with data:', dataToPass);
      
      // Ensure we have all required fields
      if (salary.trim() && role.trim() && location.trim()) {
        console.log('All fields validated, calling onComplete');
        onComplete(dataToPass);
      } else {
        console.log('Missing required fields, not calling onComplete');
        setIsComplete(false); // Reset if validation fails
      }
    }
  }, [isComplete, salary, role, location, fullLocation, onComplete]);

  const getPredictionsAndSetLocation = (input: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!autocompleteService.current || !placesService.current) {
        // Fallback: just use the typed input
        setFullLocation(input);
        console.log('Set fullLocation from manual input (no service):', input);
        resolve();
        return;
      }

      const request = {
        input: input,
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(40.4774, -74.2591), 
          new google.maps.LatLng(40.9176, -73.7004)
        ),
        strictBounds: true,
        componentRestrictions: { country: 'us' }
      };

      autocompleteService.current.getPlacePredictions(request, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
          const firstPrediction = predictions[0];
          console.log('Got prediction:', firstPrediction);
          
          // Get place details for the first prediction
          const detailsRequest = {
            placeId: firstPrediction.place_id,
            fields: ['name', 'formatted_address']
          };
          
          placesService.current!.getDetails(detailsRequest, (place, detailsStatus) => {
            if (detailsStatus === google.maps.places.PlacesServiceStatus.OK && place) {
              const placeName = place.name || firstPrediction.structured_formatting.main_text;
              const fullAddr = place.formatted_address || firstPrediction.description;
              
              console.log('Set location from prediction:', placeName, 'Full address:', fullAddr);
              setLocation(placeName);
              setFullLocation(fullAddr);
            } else {
              // Fallback to the prediction description
              setFullLocation(firstPrediction.description);
              console.log('Set fullLocation from prediction description:', firstPrediction.description);
            }
            resolve();
          });
        } else {
          // No predictions found, use the typed input as fallback
          setFullLocation(input);
          console.log('Set fullLocation from manual input (no predictions):', input);
          resolve();
        }
      });
    });
  };

  // Simplified completion check
  const checkForCompletion = () => {
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    console.log('checkForCompletion called:', { salary, role, location, allFilled });
    
    if (allFilled && !isComplete) {
      console.log('Setting isComplete to true');
      setIsComplete(true);
    }
  };

  const handleRoleChange = (value: string) => {
    console.log('handleRoleChange called with:', value);
    
    // Check if this is a predefined job option (safe to use)
    const isPredefinedOption = JOB_OPTIONS.includes(value);
    
    // Only validate for profanity if it's NOT a predefined option
    if (!isPredefinedOption && value && isProfane(value)) {
      console.log('Profanity detected in manual role input:', value);
      toast({
        title: "Invalid role",
        description: "Inappropriate content detected in job role",
        variant: "destructive"
      });
      return; // Don't set the value if it's profane
    }
    
    console.log('Setting role:', value, 'isPredefined:', isPredefinedOption);
    setRole(value);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Update location state immediately to allow smooth typing
    setLocation(value);
    // Clear fullLocation when manually typing to indicate it needs to be resolved
    if (fullLocation && value !== location) {
      setFullLocation('');
    }
    // Reset the Google Places flag when manually typing
    setIsGooglePlacesSelected(false);
  };

  const handleLocationBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    
    if (!value) {
      setLocation('');
      setFullLocation('');
      setIsGooglePlacesSelected(false);
      checkForCompletion();
      return;
    }
    
    // Only validate for profanity on blur for manual input
    if (value && isProfane(value)) {
      toast({
        title: "Invalid location",
        description: "Inappropriate content detected in location",
        variant: "destructive"
      });
      // Clear the invalid input
      setLocation('');
      setFullLocation('');
      setIsGooglePlacesSelected(false);
      if (autocompleteRef.current) {
        autocompleteRef.current.value = '';
      }
      return;
    }
    
    // Skip prediction logic if Google Places was already selected
    if (isGooglePlacesSelected) {
      console.log('Skipping predictions - Google Places already selected');
      checkForCompletion();
      return;
    }
    
    // Always try to get the best Google Places match for any typed input
    if (!fullLocation || fullLocation === value) {
      console.log('Getting predictions for typed location:', value);
      await getPredictionsAndSetLocation(value);
    }
    
    checkForCompletion();
  };

  return (
    <motion.div 
      initial={{ y: 0 }} 
      animate={{ y: isComplete ? '-100vh' : 0 }} 
      transition={{ duration: 0.5, ease: 'easeInOut' }} 
      className="absolute inset-0 z-50 flex items-center justify-center"
    >
      <div className="app-card flex flex-col justify-center px-8 py-12">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-app-black mb-6 font-normal text-lg">
              Real Info. Real Fast.
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center space-x-3">
                <input 
                  type="text" 
                  value={salary} 
                  onChange={e => handleSalaryChange(e.target.value)} 
                  onBlur={checkForCompletion} 
                  placeholder="$14" 
                  className="app-input text-center text-lg flex-1" 
                />
                <select 
                  value={timePeriod} 
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="px-4 py-3 bg-white text-sm" 
                  style={{ border: '1px solid hsl(var(--app-gray-light))', borderRadius: '0.5rem', height: '48px', fontSize: '16px' }}
                >
                  <option value="HR">HR</option>
                  <option value="MO">MO</option>
                  <option value="YR">YR</option>
                </select>
              </div>
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg font-normal">3 Easy Questions.</p>
            </div>

            <div>
              <JobSearchDropdown 
                value={role} 
                onChange={handleRoleChange}
                onBlur={checkForCompletion} 
                placeholder="Search or select a job role..." 
                className="app-input" 
              />
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg">Find Neighborhood Income Trends.</p>
            </div>

            <div>
              <input 
                ref={autocompleteRef} 
                type="text" 
                onChange={handleLocationChange}
                onBlur={handleLocationBlur} 
                placeholder="Search NYC locations..." 
                className="app-input" 
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-app-black text-lg">Grow Your Community.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InitiationPage;
