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
  showAddForm?: boolean;
  newBusinessAddress?: string;
  onAddressChange?: (address: string) => void;
  onCreateBusiness?: () => void;
  isCreatingBusiness?: boolean;
}

const BusinessSearchDropdown: React.FC<BusinessSearchDropdownProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Search businesses...",
  className = "",
  salary,
  role,
  timePeriod,
  showAddForm: externalShowAddForm = false,
  newBusinessAddress: externalAddress = "",
  onAddressChange,
  onCreateBusiness: externalCreateBusiness,
  isCreatingBusiness: externalIsCreating = false
}) => {
  const { businesses, setBusinesses } = useBusinessesData();
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [internalShowAddForm, setInternalShowAddForm] = useState(false);
  const [internalAddress, setInternalAddress] = useState('');
  const [internalIsCreating, setInternalIsCreating] = useState(false);
  const { toast } = useToast();
  
  // Use external props if provided, otherwise use internal state
  const showAddForm = externalShowAddForm || internalShowAddForm;
  const newBusinessAddress = externalAddress || internalAddress;
  const isCreatingBusiness = externalIsCreating || internalIsCreating;
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resultsCache = useRef<Map<string, any[]>>(new Map());
  const isScrolling = useRef(false);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (isScrolling.current) return;
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setInternalShowAddForm(false);
      }
    };

    const handleScroll = () => {
      isScrolling.current = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling.current = false;
      }, 150);
    };

    const dropdown = dropdownRef.current;
    if (dropdown) {
      dropdown.addEventListener('scroll', handleScroll);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (dropdown) {
        dropdown.removeEventListener('scroll', handleScroll);
      }
      clearTimeout(scrollTimeout);
    };
  }, []);

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);

    if (inputValue.length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      setInternalShowAddForm(false);
      return;
    }

    if (inputValue.length > 2) {
      // Check cache first
      const cachedResults = resultsCache.current.get(inputValue.toLowerCase());
      if (cachedResults) {
        setSearchResults(cachedResults.slice(0, 5));
        setShowDropdown(true);
        setInternalShowAddForm(false);
        return;
      }
      
      const { filteredBusinesses } = searchBusinesses(businesses, inputValue);
      const results = filteredBusinesses.slice(0, 5);
      
      // Cache the results
      resultsCache.current.set(inputValue.toLowerCase(), results);
      
      // Limit cache size
      if (resultsCache.current.size > 30) {
        const firstKey = resultsCache.current.keys().next().value;
        resultsCache.current.delete(firstKey);
      }
      
      setSearchResults(results);
      setShowDropdown(true);
      setInternalShowAddForm(false);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
      setInternalShowAddForm(false);
    }
  };

  const handleBusinessSelect = (business: any) => {
    onChange(business.name, business.formatted_address || business.vicinity || business.name);
    setShowDropdown(false);
    setInternalShowAddForm(false);
  };

  const handleInputBlur = () => {
    if (isScrolling.current) return;
    
    // Delay blur to allow dropdown clicks
    setTimeout(() => {
      if (!isScrolling.current) {
        if (value && !businesses.find(b => b.name.toLowerCase() === value.toLowerCase())) {
          // Business doesn't exist - don't auto-show form, let parent handle it
          setShowDropdown(false);
        } else {
          setShowDropdown(false);
          setInternalShowAddForm(false);
        }
        onBlur?.();
      }
    }, 150);
  };

  const businessNotFound = value && !businesses.find(b => b.name.toLowerCase() === value.toLowerCase()) && searchResults.length === 0;

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
    if (externalCreateBusiness) {
      externalCreateBusiness();
      return;
    }

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

    setInternalIsCreating(true);

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

      setInternalShowAddForm(false);
      setInternalAddress('');
    } catch (error) {
      console.error('Error creating business:', error);
      toast({
        title: "Error",
        description: "Failed to create business. Please try again.",
        variant: "destructive"
      });
    } finally {
      setInternalIsCreating(false);
    }
  };

  const handleAddressChange = (address: string) => {
    if (onAddressChange) {
      onAddressChange(address);
    } else {
      setInternalAddress(address);
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
      
      {/* Tiny text bottom left - only show when business not found */}
      {businessNotFound && (
        <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
          Business not found - fill address below
        </div>
      )}

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

    </div>
  );
};

export default BusinessSearchDropdown;