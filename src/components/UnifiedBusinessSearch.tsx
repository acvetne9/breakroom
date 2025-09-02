import React, { useState, useEffect, useRef } from 'react';
import { searchBusinessesEnhanced, EnhancedBusiness } from '@/services/enhancedBusinessSearch';
import { parseSearchFilters } from '@/services/businessFiltering';
import { isProfane } from '@/utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import { Search } from 'lucide-react';

interface UnifiedBusinessSearchProps {
  value: string;
  onChange: (value: string, business?: EnhancedBusiness, filters?: any) => void;
  onBusinessSelect?: (business: EnhancedBusiness) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  variant?: 'dropdown' | 'search-bar';
  showIcon?: boolean;
  onLocationSave?: (location: string, fullLocation: string) => void;
}

const UnifiedBusinessSearch: React.FC<UnifiedBusinessSearchProps> = ({
  value,
  onChange,
  onBusinessSelect,
  onBlur,
  placeholder = "Search businesses, roles, salary...",
  className = "",
  variant = 'dropdown',
  showIcon = false,
  onLocationSave
}) => {
  const [searchResults, setSearchResults] = useState<EnhancedBusiness[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onChange(value);

    if (value.trim()) {
      setIsSearching(true);
      try {
        const results = await searchBusinessesEnhanced(value.trim(), 10);
        setSearchResults(results);
        setShowDropdown(true);
        
        // Parse and pass search filters 
        const filters = parseSearchFilters(value.trim());
        if (filters && (filters.textTerms.length > 0 || filters.salaryQuery || filters.roleFilter || filters.businessTypeFilter)) {
          // Apply filters when search has meaningful criteria
          onChange(value, undefined, filters);
        } else if (results.length === 1) {
          // Single specific business result - clear filters but don't zoom yet
          onChange(value, results[0], null);
        } else {
          // Clear filters when no meaningful search
          onChange(value, undefined, null);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
      setShowDropdown(false);
      // Clear filters when search is empty
      onChange(value, undefined, null);
    }
  };

  const handleBusinessClick = (business: EnhancedBusiness) => {
    onChange(business.name, business);
    onBusinessSelect?.(business);
    setShowDropdown(false);
    setSearchResults([]);
    
    // Save the clicked business location
    if (onLocationSave && business.name) {
      const fullLocation = business.formatted_address || business.vicinity || business.name;
      onLocationSave(business.name, fullLocation);
    }
  };

  const performSearch = () => {
    if (!value.trim()) return;
    
    // Check for profanity in search terms
    if (isProfane(value)) {
      toast({
        title: "Search blocked",
        description: "Inappropriate search terms detected",
        variant: "destructive"
      });
      onChange(''); // Clear the search input
      return;
    }
    
    // Apply search filters to trigger map filtering
    const filters = parseSearchFilters(value.trim());
    onChange(value, undefined, filters);
    setShowDropdown(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleInputBlur = () => {
    // Delay blur to allow dropdown clicks
    setTimeout(() => {
      setShowDropdown(false);
      onBlur?.();
    }, 150);
  };

  const baseInputClasses = variant === 'search-bar' 
    ? "search-bar pr-12" 
    : "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e)}
          onBlur={handleInputBlur}
          onKeyPress={handleKeyPress}
          onFocus={() => {
            if (value.length > 2) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          className={`${baseInputClasses} ${className}`}
        />
        {showIcon && variant === 'search-bar' && (
          <button
            onClick={performSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-gray-dark transition-colors"
          >
            <Search size={18} />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && (searchResults.length > 0 || isSearching) && (
        <div className={`absolute ${variant === 'search-bar' ? 'bottom-full mb-2' : 'top-full mt-1'} left-0 right-0 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto`}>
          {isSearching ? (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm text-muted-foreground">Searching...</div>
            </div>
          ) : (
            searchResults.map(business => (
              <div
                key={business.id}
                className="flex flex-col py-2 px-3 cursor-pointer hover:bg-accent border-b border-border last:border-b-0"
                onClick={() => handleBusinessClick(business)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{business.name}</span>
                  <span className="text-sm text-muted-foreground">{business.salary}</span>
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {business.businessType || 'Business'}
                  </span>
                  {business.roles?.slice(0, 2).map((role, index) => (
                    <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {role.role} - {role.salary}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedBusinessSearch;