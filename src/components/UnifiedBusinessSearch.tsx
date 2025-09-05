import React, { useState, useEffect, useRef } from 'react';
import { searchBusinessesEnhanced, EnhancedBusiness } from '@/services/enhancedBusinessSearch';
import { parseSearchFilters } from '@/services/businessFiltering';
import { findNeighborhood } from '@/services/neighborhoodSearch';
import { isProfane } from '@/utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import { Search } from 'lucide-react';

interface UnifiedBusinessSearchProps {
  value: string;
  onChange: (value: string, business?: EnhancedBusiness, filters?: any, neighborhoodCoords?: { lat: number; lon: number }) => void;
  onBusinessSelect?: (business: EnhancedBusiness) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  variant?: 'dropdown' | 'search-bar';
  showIcon?: boolean;
  onLocationSave?: (location: string, fullLocation: string) => void;
}

interface NeighborhoodResult {
  id: string;
  name: string;
  isNeighborhood: true;
  borough: string;
}

type SearchResult = EnhancedBusiness | NeighborhoodResult;

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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchSeqRef = useRef(0);
  const lastFiltersRef = useRef<string | null>(null);
  const committedQueryRef = useRef<string>('');
  const resultsCache = useRef<Map<string, SearchResult[]>>(new Map());
  const isScrolling = useRef(false);
  const lastExecutedQuery = useRef<string>('');

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close dropdown if we're scrolling within it
      if (isScrolling.current) return;
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    const handleScroll = () => {
      isScrolling.current = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling.current = false;
      }, 150);
    };

    // Add scroll listener to the dropdown
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

  // Debounced suggestions with improved caching
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
    
    // Check cache first for better performance
    const cachedResults = resultsCache.current.get(q);
    if (cachedResults) {
      console.log('💾 Using cached results for:', q);
      setSearchResults(cachedResults);
      setShowDropdown(true);
      setIsSearching(false);
      return;
    }
    
    // Only show suggestions, don't execute search automatically
    setIsSearching(true);
    setShowDropdown(true);
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const results: SearchResult[] = [];
        
        // Check if the query matches a neighborhood
        const neighborhood = findNeighborhood(q);
        if (neighborhood) {
          results.push({
            id: `neighborhood-${neighborhood.name}`,
            name: `${neighborhood.name} - Search Neighborhood`,
            isNeighborhood: true as const,
            borough: neighborhood.borough
          });
        }
        
        // Get business results
        const businessResults = await searchBusinessesEnhanced(q, 10);
        results.push(...businessResults);
        
        if (seq !== searchSeqRef.current) return;
        
        // Cache the results
        resultsCache.current.set(q, results);
        
        // Limit cache size to prevent memory issues
        if (resultsCache.current.size > 50) {
          const firstKey = resultsCache.current.keys().next().value;
          resultsCache.current.delete(firstKey);
        }
        
        setSearchResults(results);
        // Debounced idle search: parse filters and push to parent for live filtering
        try {
          const parsed = parseSearchFilters(q);
          const filtersKey = parsed ? JSON.stringify(parsed) : null;
          if (lastFiltersRef.current !== filtersKey) {
            lastFiltersRef.current = filtersKey;
            if (parsed?.neighborhoodFilter) {
              const neighborhoodCoords = {
                lat: parsed.neighborhoodFilter.center.lat,
                lon: parsed.neighborhoodFilter.center.lon
              };
              onChange(q, undefined, parsed, neighborhoodCoords);
            } else {
              onChange(q, undefined, parsed || null);
            }
          }
        } catch (e) {
          console.warn('Idle search filter parse failed:', e);
        }
      } catch (error) {
        console.error('Search suggestions error:', error);
        if (seq === searchSeqRef.current) setSearchResults([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 300); // Faster suggestions with caching
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

  const handleResultClick = (result: SearchResult) => {
    if ('isNeighborhood' in result && result.isNeighborhood) {
      // Handle neighborhood click - search for all businesses in that neighborhood
      const neighborhoodName = result.name.replace(' - Search Neighborhood', '');
      console.log('🏙️ [handleResultClick] Neighborhood clicked:', neighborhoodName);
      
      // Update the search input with just the neighborhood name
      onChange(neighborhoodName);
      
      // Trigger neighborhood search with coordinates
      const filters = parseSearchFilters(neighborhoodName);
      if (filters?.neighborhoodFilter) {
        const neighborhoodCoords = {
          lat: filters.neighborhoodFilter.center.lat,
          lon: filters.neighborhoodFilter.center.lon
        };
        
        committedQueryRef.current = neighborhoodName;
        lastExecutedQuery.current = neighborhoodName;
        lastFiltersRef.current = JSON.stringify(filters);
        onChange(neighborhoodName, undefined, filters, neighborhoodCoords);
      }
    } else {
      // Handle business click
      const business = result as EnhancedBusiness;
      console.log('🏢 [handleResultClick] Business clicked:', business.name);
      
      // Perform search with current value
      performSearch();
      
      // Still call the business select callback for any other handling needed
      onBusinessSelect?.(business);
      
      // Save the clicked business location
      if (onLocationSave && business.name) {
        const fullLocation = business.formatted_address || business.vicinity || business.name;
        onLocationSave(business.name, fullLocation);
      }
    }
    
    setShowDropdown(false);
    setSearchResults([]);
  };

  const performSearch = () => {
    console.log('🔍 [performSearch] Called with value:', value);
    
    const trimmedValue = value.trim();
    
    // Check if this is the same query we just executed
    if (trimmedValue === lastExecutedQuery.current && trimmedValue.length >= 3) {
      console.log('🚫 [performSearch] Skipping - same query already executed:', trimmedValue);
      setShowDropdown(false);
      return;
    }
    
    if (!trimmedValue) {
      // Clear search - commit empty query to clear filters
      if (committedQueryRef.current !== '') {
        console.log('🔄 Clearing search - removing all filters');
        committedQueryRef.current = '';
        lastFiltersRef.current = null;
        lastExecutedQuery.current = '';
        onChange(value, undefined, null);
      }
      return;
    }
    
    // Check for profanity in search terms
    if (isProfane(trimmedValue)) {
      console.log('🚫 Search blocked - profanity detected:', trimmedValue);
      toast({
        title: "Search blocked",
        description: "Inappropriate search terms detected",
        variant: "destructive"
      });
      onChange(''); // Clear the search input
      return;
    }
    
    // Commit the query and apply filters immediately (require 4+ characters for meaningful search)
    console.log('🔍 [performSearch] Trimmed value:', trimmedValue, 'length:', trimmedValue.length);
    console.log('🔍 [performSearch] Current committed query:', committedQueryRef.current);
    console.log('🔍 [performSearch] Last executed query:', lastExecutedQuery.current);
    
    if (trimmedValue.length >= 3 && committedQueryRef.current !== trimmedValue) {
      console.log('🔍 Committing search query:', trimmedValue);
      committedQueryRef.current = trimmedValue;
      lastExecutedQuery.current = trimmedValue;
      const filters = parseSearchFilters(trimmedValue);
      console.log('🔍 [performSearch] Parsed filters:', filters);
      
      // Only proceed if filters have meaningful content
      if (filters && (
        (filters.textTerms && filters.textTerms.length > 0) ||
        filters.salaryQuery ||
        filters.roleFilter ||
        filters.businessTypeFilter ||
        filters.neighborhoodFilter
      )) {
        console.log('✅ Applying valid search filters:', filters);
        const filtersKey = JSON.stringify(filters);
        lastFiltersRef.current = filtersKey;
        onChange(value, undefined, filters);
      } else {
        console.log('⚠️ No valid filters found for query:', trimmedValue);
        console.log('⚠️ Filters object:', filters);
        if (lastFiltersRef.current !== null) {
          lastFiltersRef.current = null;
          committedQueryRef.current = '';
          lastExecutedQuery.current = '';
          onChange(value, undefined, null);
        }
      }
    } else if (trimmedValue.length < 3 && lastFiltersRef.current !== null) {
      // Clear filters if search is too short
      console.log('🧹 Search too short, clearing filters');
      lastFiltersRef.current = null;
      committedQueryRef.current = '';
      lastExecutedQuery.current = '';
      onChange(value, undefined, null);
    } else {
      console.log('🔍 [performSearch] No action taken - length:', trimmedValue.length, 'committed:', committedQueryRef.current);
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleInputBlur = () => {
    // Don't blur if we're scrolling in the dropdown
    if (isScrolling.current) return;
    
    // Delay blur to allow dropdown clicks and scrolling
    setTimeout(() => {
      if (!isScrolling.current) {
        setShowDropdown(false);
        onBlur?.();
      }
    }, 200);
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
        <div className={`absolute ${variant === 'search-bar' ? 'bottom-full mb-2' : 'top-full mt-1'} left-0 right-0 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto p-1`}
             onScroll={() => {
               isScrolling.current = true;
               setTimeout(() => { isScrolling.current = false; }, 200);
             }}>
          {isSearching ? (
            <div className="flex items-center justify-center py-4 mx-1 bg-accent/50 rounded-md">
              <div className="text-sm text-muted-foreground">Searching...</div>
            </div>
          ) : (
            searchResults.map((result, index) => (
              <div
                key={result.id}
                className="flex flex-col py-2 px-3 mx-1 mb-1 last:mb-0 cursor-pointer hover:bg-accent bg-background rounded-md border border-border/50"
                onClick={() => handleResultClick(result)}
              >
                {'isNeighborhood' in result && result.isNeighborhood ? (
                  // Neighborhood result
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{result.name}</span>
                    <span className="text-xs text-muted-foreground">{result.borough}</span>
                  </div>
                ) : (
                  // Business result
                  <>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{result.name}</span>
                      <span className="text-sm text-muted-foreground">{(result as EnhancedBusiness).salary}</span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        {(result as EnhancedBusiness).businessType || 'Business'}
                      </span>
                      {(result as EnhancedBusiness).roles?.map((role, index) => (
                        <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {role.role} - {role.salary}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedBusinessSearch;