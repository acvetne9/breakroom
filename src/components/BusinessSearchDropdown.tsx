import React, { useState, useEffect, useRef } from 'react';
import { isProfane } from '@/utils/profanityFilter';
import { createOrUpdateBusinessRole } from '@/services/businesses';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { Business } from '@/types/business';

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
  onSelect?: (business: any) => void;
  onSearchResultsChange?: (hasResults: boolean, searchValue: string) => void;
  businesses?: Business[];
  setBusinesses?: (businesses: Business[] | ((prev: Business[]) => Business[])) => void;
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
  isCreatingBusiness: externalIsCreating = false,
  onSelect,
  onSearchResultsChange,
  businesses = [],
  setBusinesses
}) => {
  const { searchBusinesses, debouncedSearch } = useBusinessSearch();
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [internalShowAddForm, setInternalShowAddForm] = useState(false);
  const [internalAddress, setInternalAddress] = useState('');
  const [internalIsCreating, setInternalIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // Use external props if provided, otherwise use internal state
  const showAddForm = externalShowAddForm || internalShowAddForm;
  const newBusinessAddress = externalAddress || internalAddress;
  const isCreatingBusiness = externalIsCreating || internalIsCreating;
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const searchAbortController = useRef<AbortController | null>(null);

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
      // Cancel any pending searches on unmount
      if (searchAbortController.current) {
        searchAbortController.current.abort();
      }
    };
  }, []);

  // OPTIMIZATION: Debounced search handler - waits 200ms after user stops typing
  const handleInputChange = async (inputValue: string) => {
    onChange(inputValue);

    // Cancel previous search if still running
    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }

    if (inputValue.length === 0) {
      setSearchResults([]);
      onSearchResultsChange?.(false, inputValue);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    if (inputValue.length > 2) {
      setIsSearching(true);
      searchAbortController.current = new AbortController();
      
      try {
        // OPTIMIZATION: Use debounced search to avoid excessive queries
        const startTime = performance.now();
        const results = await debouncedSearch(inputValue, 10, 200); // 200ms debounce
        
        console.log(`🔍 Search completed in ${(performance.now() - startTime).toFixed(0)}ms`);
        
        setSearchResults(results);
        onSearchResultsChange?.(results.length > 0, inputValue);
        setShowDropdown(true);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Search error:', error);
        }
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleBusinessSelect = (business: any) => {
    console.log('🎯 Business selected:', business.name);
    
    // Dispatch fly-to event with coordinates (same pattern as UnifiedBusinessSearch)
    if (business.position?.lat && business.position?.lng) {
      window.dispatchEvent(new CustomEvent('flyToBusiness', {
        detail: {
          lat: business.position.lat,
          lng: business.position.lng,
          businessId: business.id
        }
      }));
    }
    
    onChange(business.name, business.address || business.name);
    setShowDropdown(false);
    setInternalShowAddForm(false);
    onSelect?.(business);
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
      return;
    }

    if (isProfane(newBusinessAddress)) {
      return;
    }

    if (!salary || !role) {
      return;
    }

    setInternalIsCreating(true);

    try {
      // Geocode the address
      const coordinates = await geocodeAddress(newBusinessAddress);
      
      if (!coordinates) {
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
        roles: [{
          role: role,
          salary: salary,
          votesTotal: 0,
          userVote: null
        }]
      };

      if (setBusinesses) {
        setBusinesses(prev => [...prev, newBusiness]);
      }

      setInternalShowAddForm(false);
      setInternalAddress('');
    } catch (error) {
      console.error('Error creating business:', error);
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
      
      {/* Tiny text bottom left - only show when business not found 
      {businessNotFound && (
        <div className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
          Business not found - fill address below
        </div>
      )} */}

      {/* Search Results Dropdown */}
      {showDropdown && (searchResults.length > 0 || value.trim()) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[9999]">
          <div 
            className="bg-card shadow-xl border border-border max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
            style={{ borderRadius: '8px' }}
            onScroll={() => {
              isScrolling.current = true;
              setTimeout(() => { isScrolling.current = false; }, 200);
            }}
          >
            {isSearching ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <div className="animate-pulse">Searching...</div>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                No businesses found
              </div>
            ) : (
              <div className="p-3">
                {searchResults.map((business, index) => (
                  <div key={business.id}>
                    <div
                      className="cursor-pointer py-1.5 px-0 rounded transition-colors hover:bg-accent/20"
                      onClick={() => handleBusinessSelect(business)}
                    >
                      <div className="flex flex-col">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{business.name}</span>
                          {business.businessType && business.businessType !== "Other" && (
                            <span className="text-sm opacity-70">
                              {business.businessType}
                            </span>
                          )}
                        </div>
                        
                        {/* Address display */}
                        {business.address && (
                          <span className="text-xs text-muted-foreground truncate mt-0.5">
                            {business.address}
                          </span>
                        )}
                        
                        {/* Optional: Show roles */}
                        {business.roles && business.roles.length > 0 && (
                          <div className="flex gap-2 mt-1">
                            {business.roles.slice(0, 2).map((role: any, idx: number) => (
                              <span key={idx} className="text-xs text-muted-foreground">
                                {role.role}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Divider between results */}
                    {index < searchResults.length - 1 && (
                      <div className="h-px bg-border/30 my-1.5"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default BusinessSearchDropdown;
