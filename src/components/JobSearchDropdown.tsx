import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface JobSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

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

const JobSearchDropdown: React.FC<JobSearchDropdownProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Search or select a job role...",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(JOB_OPTIONS);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const filtered = JOB_OPTIONS.filter(job =>
      job.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredOptions(filtered);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        onBlur?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onBlur]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleOptionSelect = (option: string) => {
    onChange(option);
    setSearchTerm('');
    setIsOpen(false);
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsOpen(false);
      setSearchTerm('');
      onBlur?.();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const displayValue = searchTerm || value;

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${className} pr-8`}
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-black transition-colors"
        >
          <ChevronDown 
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ border: '1px solid hsl(var(--app-gray-light))' }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="w-full px-3 py-2 text-left transition-colors text-app-black hover:bg-gray-50"
              >
                {option}
              </button>
            ))
          ) : searchTerm ? (
            <div className="px-3 py-2 text-app-gray-medium text-sm">
              Press Enter to use "{searchTerm}"
            </div>
          ) : (
            <div className="px-3 py-2 text-app-gray-medium text-sm">
              No matching jobs found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JobSearchDropdown;