import React from 'react';
import { isProfane } from '../utils/profanityFilter';

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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleBlur = () => {
    if (isProfane(value)) {
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