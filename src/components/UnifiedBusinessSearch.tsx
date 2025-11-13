import React, { useState, useEffect, useRef } from 'react';
import { EnhancedBusiness } from '@/types/search';
import { parseSearchFilters } from '@/services/businessFiltering';
import { findNeighborhoodBoundaryByName } from '@/utils/nyc_neighborhoods';
import { isProfane } from '@/utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import { Search } from 'lucide-react';
import { searchBusinessesByQuery } from '@/services/unifiedSearch';

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
  mapBusinesses?: any[];
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
  onLocationSave,
  mapBusinesses = []
}) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const isScrolling = useRef(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchSeqRef = useRef(0);
  const lastFiltersRef = useRef<string | null>(null);
  const committedQueryRef = useRef<string>('');
  const resultsCache = useRef<Map<string, SearchResult[]>>(new Map());
  const lastExecutedQuery = useRef<string>('');

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close dropdown if we're scrolling within it
      if (isScrolling.current) return;
      
      // Don't close if clicking on the input or dropdown
      if (
        (inputRef.current && inputRef.current.contains(event.target as Node)) ||
        (dropdownRef.current && dropdownRef.current.contains(event.target as Node))
      ) {
        return;
      }
      
      setShowDropdown(false);
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

  // Show businesses from map in dropdown
  useEffect(() => {
    const q = value.trim();
    
    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      if (lastFiltersRef.current !== null) {
        lastFiltersRef.current = null;
        committedQueryRef.current = '';
        onChange(value, undefined, null);
      }
      return;
    }
    
    // Check cache first
    const cachedResults = resultsCache.current.get(q);
    if (cachedResults) {
      setSearchResults(cachedResults);
      setShowDropdown(true);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    setShowDropdown(true);
    const seq = ++searchSeqRef.current;
    
    const timer = setTimeout(async () => {
      try {
        const results: SearchResult[] = [];
        
        // Check for neighborhood match
        const neighborhood = findNeighborhoodBoundaryByName(q);
        if (neighborhood) {
          results.push({
            id: `neighborhood-${neighborhood.name}`,
            name: `${neighborhood.name} - Search Neighborhood`,
            isNeighborhood: true as const,
            borough: neighborhood.borough
          });
        }
        
        // Perform immediate search for dropdown (independent of map's debounced search)
        console.log(`🔍 [Dropdown] Performing immediate search for: "${q}"`);
        const searchResults = await searchBusinessesByQuery(q, undefined, 30);
        
        // Check if this search is still current
        if (seq !== searchSeqRef.current) return;
        
        console.log(`✅ [Dropdown] Found ${searchResults.length} immediate results`);
        
        // Convert to EnhancedBusiness format and add to results
        const enhancedResults = searchResults.map(b => ({
          ...b,
          lat: b.position.lat,
          lng: b.position.lng
        })) as EnhancedBusiness[];
        
        results.push(...enhancedResults);
        
        // Cache results (limit cache size to prevent memory issues)
        resultsCache.current.set(q, results);
        if (resultsCache.current.size > 50) {
          const firstKey = resultsCache.current.keys().next().value;
          if (firstKey) resultsCache.current.delete(firstKey);
        }
        
        setSearchResults(results);
        
        // Update parent with filters
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
          console.warn('Filter parse failed:', e);
        }
      } catch (error) {
        console.error('Search error:', error);
        if (seq === searchSeqRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (seq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [value, onChange, mapBusinesses]);

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
      
      // Update input to show the selected business name
      onChange(business.name);
      
      // Call the business select callback so parent can handle the selection
      onBusinessSelect?.(business);
      
      // Save the clicked business location
      if (onLocationSave && business.name) {
        const fullLocation = business.formatted_address || business.vicinity || business.name;
        onLocationSave(fullLocation, fullLocation);
      }
    }
    
    setShowDropdown(false);
    setSearchResults([]);
  };

  const performSearch = () => {
    const trimmedValue = value.trim();
    
    // Check if this is the same query we just executed
    if (trimmedValue === lastExecutedQuery.current && trimmedValue.length >= 3) {
      setShowDropdown(false);
      return;
    }
    
    if (!trimmedValue) {
      // Clear search - commit empty query to clear filters
      if (committedQueryRef.current !== '') {
        committedQueryRef.current = '';
        lastFiltersRef.current = null;
        lastExecutedQuery.current = '';
        onChange(value, undefined, null);
      }
      return;
    }
    
    // Check for profanity in search terms
    if (isProfane(trimmedValue)) {
      toast({
        title: "Search blocked",
        description: "Inappropriate search terms detected",
        variant: "destructive"
      });
      onChange(''); // Clear the search input
      return;
    }
    
    // Commit the query and apply filters immediately (require 3+ characters for meaningful search)
    if (trimmedValue.length >= 3 && committedQueryRef.current !== trimmedValue) {
      committedQueryRef.current = trimmedValue;
      lastExecutedQuery.current = trimmedValue;
      const filters = parseSearchFilters(trimmedValue);
      
      // Only proceed if filters have meaningful content
      if (filters && (
        (filters.textTerms && Array.isArray(filters.textTerms) && filters.textTerms.length > 0) ||
        filters.salaryQuery ||
        filters.roleFilter ||
        filters.businessTypeFilter ||
        filters.neighborhoodFilter
      )) {
        const filtersKey = JSON.stringify(filters);
        lastFiltersRef.current = filtersKey;
        onChange(value, undefined, filters);
      } else {
        if (lastFiltersRef.current !== null) {
          lastFiltersRef.current = null;
          committedQueryRef.current = '';
          lastExecutedQuery.current = '';
          onChange(value, undefined, null);
        }
      }
    } else if (trimmedValue.length < 3 && lastFiltersRef.current !== null) {
      // Clear filters if search is too short
      lastFiltersRef.current = null;
      committedQueryRef.current = '';
      lastExecutedQuery.current = '';
      onChange(value, undefined, null);
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't blur if we're scrolling in the dropdown
    if (isScrolling.current) return;
    
    // Don't close if focusing within the dropdown
    if (dropdownRef.current && e.relatedTarget && dropdownRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    
    // Delay blur to allow dropdown clicks
    setTimeout(() => {
      if (!isScrolling.current) {
        setShowDropdown(false);
        onBlur?.();
      }
    }, 250);
  };

  // Check if parent is passing app-input class (used in InitiationPage)
  const isAppInputStyle = className.includes('app-input');

  const baseInputClasses = variant === 'search-bar' 
    ? "search-bar pr-12" 
    : isAppInputStyle
      ? "" // Don't add base classes if app-input is specified
      : "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            const trimmedValue = value.trim();
            // Show dropdown if we have a value and either:
            // 1. We have current search results to display
            // 2. We have cached results for this value
            // 3. We're currently searching
            if (trimmedValue.length > 2 && 
                (searchResults.length > 0 || 
                 resultsCache.current.has(trimmedValue) || 
                 isSearching)) {
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
      {showDropdown && (searchResults.length > 0 || isSearching || value.trim()) && (
        <div className={`absolute ${variant === 'search-bar' ? 'bottom-full mb-2' : 'top-full mt-1'} left-0 right-0 z-[9999]`}>
          <div 
            ref={dropdownRef}
            className="bg-card shadow-xl border border-border max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
            style={{ borderRadius: '8px' }}
            onScroll={() => {
              isScrolling.current = true;
              setTimeout(() => { isScrolling.current = false; }, 200);
            }}
          >
            {isSearching ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                No relevant businesses found
              </div>
            ) : (
              <div className="p-3">
                {searchResults.map((result, index) => (
                  <div key={result.id}>
                    <div
                      className="cursor-pointer py-1.5 px-0 rounded transition-colors hover:bg-accent/20"
                      onClick={() => handleResultClick(result)}
                    >
                      {'isNeighborhood' in result && result.isNeighborhood ? (
                        // Neighborhood result
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{result.name}</span>
                          <span className="text-xs opacity-70">{result.borough}</span>
                        </div>
                      ) : (
                        // Business result
                        <div className="flex flex-col">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{(result as EnhancedBusiness).name}</span>
                            <span className="text-sm opacity-70">
                              {(result as EnhancedBusiness).businessType === "Other"
                                ? ""
                                : (result as EnhancedBusiness).businessType || "Business"}
                            </span>
                          </div>
                           {/* Show Supabase address if it exists, otherwise nothing */}
                           {(result as EnhancedBusiness).address && (
                             <span className="text-xs text-gray-500 truncate mt-0.5">
                               {(result as EnhancedBusiness).address}
                             </span>
                           )}
                        </div>
                      )}
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

export default UnifiedBusinessSearch;