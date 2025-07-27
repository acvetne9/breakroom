import React, { useRef, useEffect } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string, fullLocation?: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Search NYC locations...",
  className = "app-input"
}) => {
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const autocompleteInstance = useRef<google.maps.places.Autocomplete | null>(null);
  const { toast } = useToast();

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
        const nycBounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(40.4774, -74.2591), 
          new google.maps.LatLng(40.9176, -73.7004)
        );
        
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
            const placeName = place.name;
            const fullAddr = place.formatted_address || place.name;
            onChange(placeName, fullAddr);
          }
        });
      } catch (error) {
        console.error('Error loading Google Places:', error);
      }
    };

    initAutocomplete();
  }, [onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    
    if (value && isProfane(value)) {
      toast({
        title: "Invalid location",
        description: "Inappropriate content detected in location",
        variant: "destructive"
      });
      onChange('');
      if (autocompleteRef.current) {
        autocompleteRef.current.value = '';
      }
      return;
    }
    
    onBlur?.();
  };

  return (
    <input
      ref={autocompleteRef}
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};

export default LocationSearchInput;