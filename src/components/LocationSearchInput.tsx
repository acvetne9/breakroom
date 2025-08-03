import React from 'react';
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
  placeholder = "Enter NYC location...",
  className = "app-input"
}) => {
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleBlur = () => {
    if (isProfane(value)) {
      toast({
        title: "Inappropriate content detected",
        description: "Please use appropriate language in your location.",
        variant: "destructive",
      });
      onChange(''); // Clear the input
      return;
    }
    onBlur?.();
  };

  return (
    <input
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