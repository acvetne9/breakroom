import React, { useState, useEffect, useRef } from 'react';
import { EnhancedBusiness } from '@/types/search';
import { parseSearchFilters } from '@/services/businessFiltering';
import { findNeighborhoodBoundaryByName } from '@/utils/nyc_neighborhoods';
import { isProfane } from '@/utils/profanityFilter';
import { Search } from 'lucide-react';
import { searchBusinessesByQuery } from '@/services/unifiedSearch';

interface UnifiedBusinessSearchProps {
  value: string;
  onChange: (value: string, business?: EnhancedBusiness, filters?: any, neighborhoodCoords?: { lat: number; lon: number }) => void;
  onBusinessSelect?: (business: EnhancedBusiness) => void;
  onNoResults?: (query: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
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
  onNoResults,
  onBlur,
  onFocus,
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
  const isScrolling = useRef(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchSeqRef = useRef(0);
  const lastFiltersRef = useRef<string | null>(null);
  const committedQueryRef = useRef<string>('');
  const resultsCache = useRef<Map<string, SearchResult[]>>(new Map());
  const lastExecutedQuery = useRef<string>('');
  const wasClosedIntentionally = useRef(false);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserInteracted = useRef(false);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      console.log('🖱️ Click outside detected', {
        isScrolling: isScrolling.current,
        targetElement: event.target,
        isInputClick: inputRef.current?.contains(event.target as Node),
        isDropdownClick: dropdownRef.current?.contains(event.target as Node)
      });
      
      // Don't close dropdown if we're scrolling within it
      if (isScrolling.current) {
        console.log('⏸️ Click ignored - scrolling');
        return;
      }
      
      // Don't close if clicking on the input or dropdown
      if (
        (inputRef.current && inputRef.current.contains(event.target as Node)) ||
        (dropdownRef.current && dropdownRef.current.contains(event.target as Node))
      ) {
        console.log('⏸️ Click ignored - inside component');
        return;
      }
      
      console.log('✅ Closing dropdown');
      wasClosedIntentionally.current = true;
      setShowDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle scroll within dropdown
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const dropdown = dropdownRef.current;
    
    if (showDropdown && dropdown) {
      const handleScroll = () => {
        isScrolling.current = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          isScrolling.current = false;
          console.log('🔄 Scroll state reset');
        }, 150);
      };
      
      dropdown.addEventListener('scroll', handleScroll);
      return () => {
        dropdown.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
      };
    }
  }, [showDropdown]);

  // Reset interaction flag on unmount
  useEffect(() => {
    return () => {
      hasUserInteracted.current = false;
    };
  }, []);

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
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

    // Don't auto-search on mount with initial value for dropdown variant
    // Only search if user has interacted OR if it's the search-bar variant
    if (!hasUserInteracted.current && variant === 'dropdown') {
      console.log('⏸️ Skipping auto-search on mount - waiting for user interaction');
      return;
    }
    
    // Check cache first
    const cachedResults = resultsCache.current.get(q);
    if (cachedResults) {
      setSearchResults(cachedResults);
      // Only show dropdown if not intentionally closed
      if (!wasClosedIntentionally.current) {
        setShowDropdown(true);
      }
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    // Only show dropdown if not intentionally closed
    if (!wasClosedIntentionally.current) {
      setShowDropdown(true);
    }
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
          id: b.id,
          name: b.name,
          lat: b.position.lat,
          lng: b.position.lng,
          position: b.position,
          address: b.address || '',
          roles: b.roles || [],
          atmosphere: b.atmosphere || [],
          businessType: b.businessType || '',
          website: b.website || ''
        })) as EnhancedBusiness[];
        
        results.push(...enhancedResults);
        
        // Check again if this search is still current before updating
        if (seq !== searchSeqRef.current) return;
        
        setSearchResults(results);
        
        // Cache results with size limit
        if (resultsCache.current.size > 20) {
          const firstKey = resultsCache.current.keys().next().value;
          resultsCache.current.delete(firstKey);
        }
        resultsCache.current.set(q, results);
        
        // Notify parent if no business results
        if (enhancedResults.length === 0 && onNoResults) {
          onNoResults(q);
        }
        
        // Parse filters from query for the parent
        const filters = await parseSearchFilters(q);
        if (filters && JSON.stringify(filters) !== lastFiltersRef.current) {
          lastFiltersRef.current = JSON.stringify(filters);
          onChange(value, undefined, filters);
        } else if (!filters && lastFiltersRef.current !== null) {
          lastFiltersRef.current = null;
          onChange(value, undefined, null);
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
  }, [value, mapBusinesses, onChange, onNoResults, variant]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    hasUserInteracted.current = true;
    wasClosedIntentionally.current = false;
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
      
      // Close dropdown and trigger search
      setShowDropdown(false);
      wasClosedIntentionally.current = true;
      
      // Trigger a fresh search for businesses in this neighborhood
      const neighborhood = findNeighborhoodBoundaryByName(neighborhoodName);
      if (neighborhood && neighborhood.boundary) {
        // Calculate center from boundary coordinates
        const lats = neighborhood.boundary.map((p: { lat: number; lon: number }) => p.lat);
        const lons = neighborhood.boundary.map((p: { lat: number; lon: number }) => p.lon);
        const centerCoords = {
          lat: (Math.max(...lats) + Math.min(...lats)) / 2,
          lon: (Math.max(...lons) + Math.min(...lons)) / 2
        };
        onChange(neighborhoodName, undefined, undefined, centerCoords);
      }
    } else {
      // It's a business result
      const business = result as EnhancedBusiness;
      onChange(business.name);
      
      if (onBusinessSelect) {
        onBusinessSelect(business);
      }
      
      // Save location if callback provided
      if (onLocationSave && business.address) {
        onLocationSave(business.address, `${business.name}, ${business.address}`);
      }
      
      setShowDropdown(false);
      wasClosedIntentionally.current = true;
    }
  };

  const performSearch = async () => {
    const query = value.trim();
    
    // Don't search if query is profane
    if (isProfane(query)) {
      console.log('🚫 Profane query detected, not searching');
      return;
    }
    
    // Don't search if query is too short
    if (query.length < 3) {
      console.log('⚠️ Query too short, not searching');
      return;
    }
    
    // Don't re-run the same search
    if (query === committedQueryRef.current) {
      console.log('⏭️ Skipping duplicate search');
      return;
    }
    
    // Only perform search if we have filters in the query
    const filters = await parseSearchFilters(query);
    if (!filters || (!filters.roleFilter && !filters.salaryQuery)) {
      console.log('⚠️ No filters detected in query, not performing search');
      return;
    }
    
    console.log('🔍 [SearchBar] Committing search query:', query);
    
    // Mark this query as committed
    committedQueryRef.current = query;
    lastExecutedQuery.current = query;
    
    // Notify parent with filters
    onChange(query, undefined, filters);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    console.log('👋 Blur event', {
      relatedTarget: e.relatedTarget,
      isDropdownFocus: dropdownRef.current?.contains(e.relatedTarget as Node)
    });
    
    // Don't close if focusing within the dropdown
    if (dropdownRef.current && e.relatedTarget && dropdownRef.current.contains(e.relatedTarget as Node)) {
      console.log('⏸️ Blur ignored - focusing dropdown');
      return;
    }
    
    // Delay closing to prevent premature closure during rapid typing
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    
    blurTimeoutRef.current = setTimeout(() => {
      console.log('✅ Closing dropdown on blur (delayed)');
      wasClosedIntentionally.current = true;
      setShowDropdown(false);
      onBlur?.();
    }, 150);
  };

  // Check if parent is passing app-input class (used in InitiationPage)
  const isAppInputStyle = className.includes('app-input');
  
  const baseInputClasses = isAppInputStyle 
    ? "" // Don't override app-input styles
    : variant === 'search-bar'
      ? "w-full px-4 py-3 bg-card text-foreground border-2 border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
      : "w-full px-3 py-2 bg-background text-foreground border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Cancel any pending blur closure
            if (blurTimeoutRef.current) {
              clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = null;
            }
            hasUserInteracted.current = true;
            wasClosedIntentionally.current = false;
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
            // Call parent onFocus handler
            onFocus?.();
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
              searchResults.map((result, index) => (
                <React.Fragment key={result.id}>
                  {'isNeighborhood' in result && result.isNeighborhood ? (
                    <div
                      className="px-4 py-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="font-medium text-foreground">{result.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{result.borough}</div>
                    </div>
                  ) : (
                    <div
                      className="px-4 py-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="font-medium text-foreground">{result.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {'address' in result ? result.address : ''}
                      </div>
                    </div>
                  )}
                  {index < searchResults.length - 1 && (
                    <div className="border-t border-border" />
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedBusinessSearch;
