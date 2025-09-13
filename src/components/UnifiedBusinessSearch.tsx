import React, { useState, useEffect, useRef } from 'react';
import { searchBusinessesEnhanced, EnhancedBusiness } from '@/services/enhancedBusinessSearch';
import { parseSearchFilters } from '@/services/businessFiltering';
import { findNeighborhood } from '@/utils/nyc_neighborhoods';
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

// Enhanced relevance scoring function
const calculateRelevanceScore = (business: EnhancedBusiness, query: string): number => {
  const queryLower = query.toLowerCase().trim();
  const nameLower = business.name.toLowerCase();
  const businessType = business.businessType?.toLowerCase() || '';
  const roles = business.roles?.map(r => r.role.toLowerCase()) || [];
  
  let score = 0;
  
  // Exact match (highest priority)
  if (nameLower === queryLower) {
    score += 100;
  }
  
  // Starts with query (very high priority)
  else if (nameLower.startsWith(queryLower)) {
    score += 80;
  }
  
  // Contains query as whole word (high priority)
  else if (new RegExp(`\\b${queryLower}\\b`).test(nameLower)) {
    score += 60;
  }
  
  // Contains query as substring (medium priority)
  else if (nameLower.includes(queryLower)) {
    score += 40;
  }
  
  // Check business type relevance
  if (businessType.includes(queryLower)) {
    score += 30;
  }
  
  // Check roles relevance
  roles.forEach(role => {
    if (role.includes(queryLower)) {
      score += 25;
    }
  });
  
  // Fuzzy matching for typos (lower priority)
  const editDistance = calculateEditDistance(nameLower, queryLower);
  const maxLength = Math.max(nameLower.length, queryLower.length);
  const similarity = 1 - (editDistance / maxLength);
  
  // Only add fuzzy score if similarity is high (> 70%)
  if (similarity > 0.7 && editDistance <= 3) {
    score += Math.round(similarity * 20);
  }
  
  // Bonus for shorter names (more likely to be relevant)
  if (business.name.length <= 50) {
    score += 5;
  }
  
  return score;
};

// Levenshtein distance for fuzzy matching
const calculateEditDistance = (str1: string, str2: string): number => {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i += 1) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j += 1) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
};

// Filter and sort results by relevance
const getRelevantResults = (businesses: EnhancedBusiness[], query: string, maxResults: number = 10): EnhancedBusiness[] => {
  if (!query.trim()) return [];
  
  console.log(`🔍 getRelevantResults called with ${businesses.length} businesses, query: "${query}"`);
  
  const scoredResults = businesses
    .map(business => ({
      business,
      score: calculateRelevanceScore(business, query)
    }))
    .filter(result => {
      const passed = result.score > 0;
      console.log(`  ${passed ? '✅' : '❌'} "${result.business.name}" (Score: ${result.score})`);
      return passed;
    })
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .slice(0, maxResults) // Limit results
    .map(result => result.business);
    
  console.log(`📊 Final filtered results: ${scoredResults.length} businesses`);
  return scoredResults;
};

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
  const [debugInfo, setDebugInfo] = useState<string>('');
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

  // Enhanced debounced suggestions with relevance scoring and debugging
  useEffect(() => {
    const q = value.trim();
    console.log(`🎯 Search effect triggered with query: "${q}"`);
    
    if (!q) {
      console.log('🧹 Empty query, clearing results');
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      setDebugInfo('Empty search query');
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
    if (cachedResults && Array.isArray(cachedResults)) {
      console.log('💾 Using cached results for:', q, 'Count:', cachedResults.length);
      setSearchResults(cachedResults);
      setShowDropdown(true);
      setIsSearching(false);
      setDebugInfo(`Cached results: ${cachedResults.length} items`);
      return;
    }
    
    // Only show suggestions, don't execute search automatically
    setIsSearching(true);
    setShowDropdown(true);
    setDebugInfo('Searching...');
    const seq = ++searchSeqRef.current;
    
    const timer = setTimeout(async () => {
      console.log(`🔍 Starting async search for: "${q}" (seq: ${seq})`);
      
      try {
        const results: SearchResult[] = [];
        
        // Check if the query matches a neighborhood
        console.log('🏙️ Checking for neighborhood match...');
        const neighborhood = findNeighborhood(q);
        if (neighborhood) {
          console.log('✅ Found neighborhood:', neighborhood.name, neighborhood.borough);
          results.push({
            id: `neighborhood-${neighborhood.name}`,
            name: `${neighborhood.name} - Search Neighborhood`,
            isNeighborhood: true as const,
            borough: neighborhood.borough
          });
        } else {
          console.log('❌ No neighborhood match found');
        }
        
        // Get business results with increased limit for filtering
        console.log('🏢 Fetching business results...');
        let businessResults: EnhancedBusiness[] = [];
        
        try {
          businessResults = await searchBusinessesEnhanced(q, 50);
          console.log(`✅ searchBusinessesEnhanced returned ${businessResults.length} results`);
          
          // Log sample of raw results for debugging
          if (businessResults.length > 0) {
            console.log('📋 Sample raw results:');
            businessResults.slice(0, 3).forEach((business, i) => {
              console.log(`  ${i + 1}. "${business.name}" (Type: ${business.businessType || 'N/A'})`);
            });
          }
        } catch (searchError) {
          console.error('❌ searchBusinessesEnhanced failed:', searchError);
          setDebugInfo(`Search API error: ${searchError.message || 'Unknown error'}`);
          // Continue with empty results rather than throwing
        }
        
        // Apply relevance-based filtering and sorting
        console.log('🎯 Applying relevance filtering...');
        const relevantResults = getRelevantResults(businessResults, q, 8);
        
        console.log(`📊 Query: "${q}" - Found ${businessResults.length} raw results, filtered to ${relevantResults.length} relevant results`);
        
        results.push(...relevantResults);
        
        // Check if this search was superseded
        if (seq !== searchSeqRef.current) {
          console.log(`⏭️ Search superseded (seq ${seq} vs current ${searchSeqRef.current})`);
          return;
        }
        
        // Cache the results
        resultsCache.current.set(q, results);
        
        // Limit cache size to prevent memory issues
        if (resultsCache.current.size > 50) {
          const firstKey = resultsCache.current.keys().next().value;
          resultsCache.current.delete(firstKey);
        }
        
        console.log(`✅ Setting ${results.length} final results`);
        setSearchResults(Array.isArray(results) ? results : []);
        setDebugInfo(`Found ${results.length} results (${relevantResults.length} businesses, ${results.length - relevantResults.length} neighborhoods)`);
        
        // Debounced idle search: parse filters and push to parent for live filtering
        try {
          const parsed = parseSearchFilters(q);
          const filtersKey = parsed ? JSON.stringify(parsed) : null;
          if (lastFiltersRef.current !== filtersKey) {
            console.log('🔧 Applying new filters:', parsed);
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
          console.warn('⚠️ Idle search filter parse failed:', e);
        }
      } catch (error) {
        console.error('❌ Search suggestions error:', error);
        setDebugInfo(`Error: ${error.message || 'Unknown search error'}`);
        if (seq === searchSeqRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (seq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 300); // Faster suggestions with caching
    
    return () => {
      console.log('🧹 Cleaning up search timer');
      clearTimeout(timer);
    };
  }, [value, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    console.log(`📝 Input changed to: "${newValue}"`);
    onChange(newValue);
    if (!newValue.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      setDebugInfo('');
    }
  };

  const handleResultClick = (result: SearchResult) => {
    console.log('🖱️ Result clicked:', result);
    
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
    
    // Commit the query and apply filters immediately (require 3+ characters for meaningful search)
    console.log('🔍 [performSearch] Trimmed value:', trimmedValue, 'length:', trimmedValue.length);
    
    if (trimmedValue.length >= 3 && committedQueryRef.current !== trimmedValue) {
      console.log('🔍 Committing search query:', trimmedValue);
      committedQueryRef.current = trimmedValue;
      lastExecutedQuery.current = trimmedValue;
      const filters = parseSearchFilters(trimmedValue);
      console.log('🔍 [performSearch] Parsed filters:', filters);
      
      // Only proceed if filters have meaningful content
      if (filters && (
        (filters.textTerms && Array.isArray(filters.textTerms) && filters.textTerms.length > 0) ||
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
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('⏎ Enter key pressed, performing search');
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
            console.log('🎯 Input focused, value length:', value.length);
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

      {/* Debug Info - Remove this in production */}
      {process.env.NODE_ENV === 'development' && debugInfo && (
        <div className="absolute top-full left-0 right-0 z-[70] bg-yellow-100 border border-yellow-300 p-2 text-xs text-yellow-800">
          🐛 Debug: {debugInfo} | Results: {searchResults.length} | Searching: {isSearching ? 'Yes' : 'No'} | Dropdown: {showDropdown ? 'Open' : 'Closed'}
        </div>
      )}

      {/* Search Results Dropdown */}
      {showDropdown && (Array.isArray(searchResults) && searchResults.length > 0 || isSearching || (value.trim() && !isSearching && Array.isArray(searchResults) && searchResults.length === 0)) && (
        <div className={`absolute ${variant === 'search-bar' ? 'bottom-full mb-2' : 'top-full mt-1'} left-0 right-0 z-[60]`}>
          <div 
            className="bg-background shadow-lg border-2 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
            style={{ borderRadius: '6px', borderColor: 'hsl(var(--border))' }}
            onScroll={() => {
              isScrolling.current = true;
              setTimeout(() => { isScrolling.current = false; }, 200);
            }}
          >
            {isSearching ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : Array.isArray(searchResults) && searchResults.length === 0 && value.trim() ? (
              <div className="flex flex-col items-center justify-center py-4 text-sm text-muted-foreground">
                <div>No relevant businesses found</div>
                {process.env.NODE_ENV === 'development' && (
                  <div className="text-xs mt-2 text-gray-400">
                    Try: "restaurant", "lawyer", "Brooklyn", or salary ranges
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3">
                {Array.isArray(searchResults) && searchResults.map((result, index) => (
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
                        <div>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{result.name}</span>
                            <span className="text-sm opacity-70">{(result as EnhancedBusiness).salary}</span>
                          </div>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              {(result as EnhancedBusiness).businessType || 'Business'}
                            </span>
                            {(result as EnhancedBusiness).roles?.map((role, roleIndex) => (
                              <span key={roleIndex} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                {role.role} - {role.salary}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {index < (Array.isArray(searchResults) ? searchResults.length - 1 : -1) && (
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