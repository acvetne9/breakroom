import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader } from '@googlemaps/js-api-loader';
import JobSearchDropdown from './JobSearchDropdown';
interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
  }) => void;
}
const InitiationPage: React.FC<InitiationPageProps> = ({
  onComplete
}) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const autocompleteInstance = useRef<google.maps.places.Autocomplete | null>(null);
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
          if (place?.name) {
            setLocation(place.name);
            setFullLocation(place.formatted_address || place.name);
            handleFieldBlur();
          }
        });
      } catch (error) {
        console.error('Error loading Google Places:', error);
      }
    };
    initAutocomplete();
  }, []);
  const handleFieldBlur = () => {
    const allFilled = salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    if (allFilled && !isComplete) {
      setIsComplete(true);
      setTimeout(() => {
        onComplete({
          salary,
          role,
          location,
          fullLocation
        });
      }, 300);
    }
  };
  return <motion.div initial={{
    y: 0
  }} animate={{
    y: isComplete ? '-100vh' : 0
  }} transition={{
    duration: 0.5,
    ease: 'easeInOut'
  }} className="absolute inset-0 z-50 flex items-center justify-center">
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
                <input type="text" value={salary} onChange={e => handleSalaryChange(e.target.value)} onBlur={handleFieldBlur} placeholder="$14" className="app-input text-center text-lg flex-1" />
                <select className="px-4 py-3 bg-white text-sm" style={{ border: '1px solid hsl(var(--app-gray-light))', borderRadius: '0.5rem', height: '48px', fontSize: '16px' }}>
                  <option>HR</option>
                  <option>Annual</option>
                </select>
              </div>
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg font-normal">3 Easy Questions.</p>
            </div>

            <div>
              <JobSearchDropdown value={role} onChange={value => {
              setRole(value);
              handleFieldBlur();
            }} onBlur={handleFieldBlur} placeholder="Search or select a job role..." className="app-input" />
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg">Find Neighborhood Income Trends.</p>
            </div>

            <div>
              <input ref={autocompleteRef} type="text" value={location} onChange={e => setLocation(e.target.value)} onBlur={handleFieldBlur} placeholder="Search NYC locations..." className="app-input" />
            </div>

            <div className="text-center mt-8">
              <p className="text-app-black text-lg">Grow Your Community.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>;
};
export default InitiationPage;