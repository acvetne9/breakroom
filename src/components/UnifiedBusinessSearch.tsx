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

  const searchSeqRef = useRef(0);
  const lastFiltersRef = useRef<string | null>(null);
  const committedQueryRef = useRef<string>('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced suggestions only - no auto-search execution
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      // Clear filters when search is empty - only if there were filters before
      if (lastFiltersRef.current !== null) {
        console.log('🧹 Clearing search - removing all filters');
        lastFiltersRef.current = null;
        committedQueryRef.current = '';
        onChange(value, undefined, null);
      }
      return;
    }
    
    // Only show suggestions, don't execute search automatically
    setIsSearching(true);
    setShowDropdown(true);
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchBusinessesEnhanced(q, 10);
        if (seq !== searchSeqRef.current) return;
        setSearchResults(results);
      } catch (error) {
        console.error('Search suggestions error:', error);
        if (seq === searchSeqRef.current) setSearchResults([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 500); // Faster suggestions
    return () => clearTimeout(timer);
  }, [value, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (!newValue.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
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
    if (!value.trim()) {
      // Clear search - commit empty query to clear filters
      if (committedQueryRef.current !== '') {
        console.log('🔄 Clearing search - removing all filters');
        committedQueryRef.current = '';
        lastFiltersRef.current = null;
        onChange(value, undefined, null);
      }
      return;
    }
    
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
    
    // Commit the query and apply filters immediately (require 4+ characters for meaningful search)
    const trimmedValue = value.trim();
    if (trimmedValue.length >= 4 && committedQueryRef.current !== trimmedValue) {
      console.log('🔍 Committing search query:', trimmedValue);
      committedQueryRef.current = trimmedValue;
      const filters = parseSearchFilters(trimmedValue);
      
      // Only proceed if filters have meaningful content
      if (filters && (
        (filters.textTerms && filters.textTerms.length > 0) ||
        filters.salaryQuery ||
        filters.roleFilter ||
        filters.businessTypeFilter
      )) {
        console.log('✅ Applying valid search filters:', filters);
        const filtersKey = JSON.stringify(filters);
        lastFiltersRef.current = filtersKey;
        onChange(value, undefined, filters);
      } else {
        console.log('⚠️ No valid filters found, clearing search');
        if (lastFiltersRef.current !== null) {
          lastFiltersRef.current = null;
          committedQueryRef.current = '';
          onChange(value, undefined, null);
        }
      }
    } else if (trimmedValue.length < 4 && lastFiltersRef.current !== null) {
      // Clear filters if search is too short
      console.log('🧹 Search too short, clearing filters');
      lastFiltersRef.current = null;
      committedQueryRef.current = '';
      onChange(value, undefined, null);
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          onKeyDown={handleKeyDown}
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