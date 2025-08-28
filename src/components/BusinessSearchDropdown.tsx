import React, { useState, useEffect, useRef } from 'react';
import { useBusinessesData } from '@/hooks/useBusinessesData';
import { searchBusinesses } from '@/utils/searchUtils';
import { isProfane } from '@/utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import { createOrUpdateBusinessRole } from '@/services/businesses';

interface BusinessSearchDropdownProps {
  value: string;
  onChange: (value: string, fullLocation?: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  salary?: string;
  role?: string;
  timePeriod?: string;
}

const BusinessSearchDropdown: React.FC<BusinessSearchDropdownProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Search businesses...",
  className = "",
  salary,
  role,
  timePeriod
}) => {
  const { businesses, setBusinesses } = useBusinessesData();
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBusinessAddress, setNewBusinessAddress] = useState('');
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const { toast } = useToast();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowAddForm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);

    if (inputValue.length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      setShowAddForm(false);
      return;
    }

    if (inputValue.length > 2) {
      const { filteredBusinesses } = searchBusinesses(businesses, inputValue);
      setSearchResults(filteredBusinesses.slice(0, 5));
      setShowDropdown(true);
      setShowAddForm(false);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
      setShowAddForm(false);
    }
  };

  const handleBusinessSelect = (business: any) => {
    onChange(business.name, business.formatted_address || business.vicinity || business.name);
    setShowDropdown(false);
    setShowAddForm(false);
  };

  const handleInputBlur = () => {
    // Delay blur to allow dropdown clicks
    setTimeout(() => {
      if (value && !businesses.find(b => b.name.toLowerCase() === value.toLowerCase())) {
        // Business doesn't exist, show add form
        setShowAddForm(true);
        setShowDropdown(false);
      } else {
        setShowDropdown(false);
        setShowAddForm(false);
      }
      onBlur?.();
    }, 150);
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', New York, NY')}&limit=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const handleCreateBusiness = async () => {
    if (!newBusinessAddress.trim()) {
      toast({
        title: "Address required",
        description: "Please enter the business address",
        variant: "destructive"
      });
      return;
    }

    if (isProfane(newBusinessAddress)) {
      toast({
        title: "Invalid address", 
        description: "Inappropriate content detected in address",
        variant: "destructive"
      });
      return;
    }

    if (!salary || !role) {
      toast({
        title: "Missing information",
        description: "Please fill in salary and role first",
        variant: "destructive"
      });
      return;
    }

    setIsCreatingBusiness(true);

    try {
      // Geocode the address
      const coordinates = await geocodeAddress(newBusinessAddress);
      
      if (!coordinates) {
        toast({
          title: "Address not found",
          description: "Could not find coordinates for this address",
          variant: "destructive"
        });
        return;
      }

      // Create business and role without auth requirement
      await createOrUpdateBusinessRole(value, role, salary);

      // Add to local businesses list
      const newBusiness = {
        id: Date.now().toString(), // Temporary ID
        name: value,
        position: coordinates,
        atmosphere: [],
        salary: salary,
        roles: [{
          role: role,
          salary: salary,
          upvotes: 0,
          downvotes: 0,
          userVote: null
        }]
      };

      setBusinesses(prev => [...prev, newBusiness]);

      toast({
        title: "Business created!",
        description: "New business has been added to the map",
      });

      setShowAddForm(false);
      setNewBusinessAddress('');
    } catch (error) {
      console.error('Error creating business:', error);
      toast({
        title: "Error",
        description: "Failed to create business. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreatingBusiness(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleInputBlur}
        onFocus={() => {
          if (value.length > 2) {
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      
      {/* Tiny text bottom left */}
      <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
        Search existing businesses
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
          {searchResults.map(business => (
            <div
              key={business.id}
              className="flex flex-col py-2 px-3 cursor-pointer hover:bg-accent border-b border-border last:border-b-0"
              onClick={() => handleBusinessSelect(business)}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">{business.name}</span>
                <span className="text-sm text-muted-foreground">{business.salary}</span>
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                  {business.businessType || 'Business'}
                </span>
                {business.roles?.slice(0, 2).map((role: any, index: number) => (
                  <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {role.role}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add New Business Form */}
      {showAddForm && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 p-3">
          <div className="text-sm font-medium mb-2">Add "{value}" as a new business</div>
          <input
            type="text"
            value={newBusinessAddress}
            onChange={(e) => setNewBusinessAddress(e.target.value)}
            placeholder="Enter business address..."
            className="w-full px-3 py-2 border border-border rounded-md text-sm mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateBusiness}
              disabled={isCreatingBusiness}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
            >
              {isCreatingBusiness ? 'Adding...' : 'Add Business'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewBusinessAddress('');
              }}
              className="px-3 py-1 border border-border rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessSearchDropdown;