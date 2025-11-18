import React, { useState, useEffect, useRef } from "react";
import { EnhancedBusiness } from "@/types/search";
import { parseSearchFilters } from "@/services/businessFiltering";
import { findNeighborhoodBoundaryByName } from "@/utils/nyc_neighborhoods";
import { isProfane } from "@/utils/profanityFilter";
import { Search } from "lucide-react";
import { searchBusinessesByQuery } from "@/services/unifiedSearch";

interface UnifiedBusinessSearchProps {
  value: string;
  onChange: (
    value: string,
    business?: EnhancedBusiness,
    filters?: any,
    neighborhoodCoords?: { lat: number; lon: number },
  ) => void;
  onBusinessSelect?: (business: EnhancedBusiness) => void;
  onNoResults?: (query: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  variant?: "dropdown" | "search-bar";
  showIcon?: boolean;
  onLocationSave?: (location: string, fullLocation: string) => void;
  mapBusinesses?: any[];
  disabled?: boolean;
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
  variant = "dropdown",
  showIcon = false,
  onLocationSave,
  mapBusinesses = [],
  disabled = false,
}) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const isScrolling = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchSeqRef = useRef(0);
  const lastFiltersRef = useRef<string | null>(null);
  const committedQueryRef = useRef<string>("");
  const resultsCache = useRef<Map<string, SearchResult[]>>(new Map());
  const lastExecutedQuery = useRef<string>("");
  const wasClosedIntentionally = useRef(false);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserInteracted = useRef(false);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      console.log("🖱️ Click outside detected", {
        isScrolling: isScrolling.current,
        targetElement: event.target,
        isInputClick: inputRef.current?.contains(event.target as Node),
        isDropdownClick: dropdownRef.current?.contains(event.target as Node),
      });

      // Don't close dropdown if we're scrolling within it
      if (isScrolling.current) {
        console.log("⏸️ Click ignored - scrolling");
        return;
      }

      // Don't close if clicking on the input or dropdown
      if (
        (inputRef.current && inputRef.current.contains(event.target as Node)) ||
        (dropdownRef.current && dropdownRef.current.contains(event.target as Node))
      ) {
        console.log("⏸️ Click ignored - inside component");
        return;
      }

      console.log("✅ Closing dropdown");
      wasClosedIntentionally.current = true;
      setShowDropdown(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
          console.log("🔄 Scroll state reset");
        }, 150);
      };

      dropdown.addEventListener("scroll", handleScroll);
      return () => {
        dropdown.removeEventListener("scroll", handleScroll);
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
    // Don't run search logic when component is disabled
    if (disabled) {
      return;
    }

    const q = value.trim();

    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      if (lastFiltersRef.current !== null) {
        lastFiltersRef.current = null;
        committedQueryRef.current = "";
        onChange(value, undefined, null);
      }
      return;
    }

    // Don't auto-search on mount with initial value for dropdown variant
    // Only search if user has interacted OR if it's the search-bar variant
    if (!hasUserInteracted.current && variant === "dropdown") {
      console.log("⏸️ Skipping auto-search on mount - waiting for user interaction");
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
            borough: neighborhood.borough,
          });
        }

        // Perform immediate search for dropdown (independent of map's debounced search)
        console.log(`🔍 [Dropdown] Performing immediate search for: "${q}"`);
        const searchResults = await searchBusinessesByQuery(q, undefined, 30);

        // Check if this search is still current
        if (seq !== searchSeqRef.current) return;

        console.log(`✅ [Dropdown] Found ${searchResults.length} immediate results`);

        // Convert to EnhancedBusiness format and add to results
        const enhancedResults = searchResults.map((b) => ({
          ...b,
          lat: b.position.lat,
          lng: b.position.lng,
        })) as EnhancedBusiness[];

        results.push(...enhancedResults);

        // Cache results (limit cache size to prevent memory issues)
        resultsCache.current.set(q, results);
        if (resultsCache.current.size > 50) {
          const firstKey = resultsCache.current.keys().next().value;
          if (firstKey) resultsCache.current.delete(firstKey);
        }

        setSearchResults(results);

        // Notify parent if no business results found (only after user stops typing)
        const hasBusinessResults = results.some((r) => !("isNeighborhood" in r));
        if (!hasBusinessResults && onNoResults) {
          // Delay callback to avoid interrupting ongoing typing
          setTimeout(() => {
            // Check if search is still current
            if (seq === searchSeqRef.current && value.trim() === q) {
              onNoResults(q);
            }
          }, 800);
        }

        // Update parent with filters
        try {
          const parsed = parseSearchFilters(q);
          const filtersKey = parsed ? JSON.stringify(parsed) : null;
          if (lastFiltersRef.current !== filtersKey) {
            lastFiltersRef.current = filtersKey;
            if (parsed?.neighborhoodFilter) {
              const neighborhoodCoords = {
                lat: parsed.neighborhoodFilter.center.lat,
                lon: parsed.neighborhoodFilter.center.lon,
              };
              onChange(q, undefined, parsed, neighborhoodCoords);
            } else {
              onChange(q, undefined, parsed || null);
            }
          }
        } catch (e) {
          console.warn("Filter parse failed:", e);
        }
      } catch (error) {
        console.error("Search error:", error);
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
  }, [value, disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      e.preventDefault(); // Prevent the change entirely
      return;
    }
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
    if (disabled) return; // Prevent selection when disabled
    if ("isNeighborhood" in result && result.isNeighborhood) {
      // Handle neighborhood click - search for all businesses in that neighborhood
      const neighborhoodName = result.name.replace(" - Search Neighborhood", "");

      // Update the search input with just the neighborhood name
      onChange(neighborhoodName);

      // Trigger neighborhood search with coordinates
      const filters = parseSearchFilters(neighborhoodName);
      if (filters?.neighborhoodFilter) {
        const neighborhoodCoords = {
          lat: filters.neighborhoodFilter.center.lat,
          lon: filters.neighborhoodFilter.center.lon,
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

    wasClosedIntentionally.current = true; // Mark as intentionally closed
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
      if (committedQueryRef.current !== "") {
        committedQueryRef.current = "";
        lastFiltersRef.current = null;
        lastExecutedQuery.current = "";
        onChange(value, undefined, null);
      }
      return;
    }

    // Check for profanity in search terms
    if (isProfane(trimmedValue)) {
      console.log("❌ Profanity detected, blocking search");
      return; // Just prevent search, don't clear input
    }

    // Commit the query and apply filters immediately (require 3+ characters for meaningful search)
    if (trimmedValue.length >= 3 && committedQueryRef.current !== trimmedValue) {
      committedQueryRef.current = trimmedValue;
      lastExecutedQuery.current = trimmedValue;
      const filters = parseSearchFilters(trimmedValue);

      // Only proceed if filters have meaningful content
      if (
        filters &&
        ((filters.textTerms && Array.isArray(filters.textTerms) && filters.textTerms.length > 0) ||
          filters.salaryQuery ||
          filters.roleFilter ||
          filters.businessTypeFilter ||
          filters.neighborhoodFilter)
      ) {
        const filtersKey = JSON.stringify(filters);
        lastFiltersRef.current = filtersKey;
        onChange(value, undefined, filters);
      } else {
        if (lastFiltersRef.current !== null) {
          lastFiltersRef.current = null;
          committedQueryRef.current = "";
          lastExecutedQuery.current = "";
          onChange(value, undefined, null);
        }
      }
    } else if (trimmedValue.length < 3 && lastFiltersRef.current !== null) {
      // Clear filters if search is too short
      lastFiltersRef.current = null;
      committedQueryRef.current = "";
      lastExecutedQuery.current = "";
      onChange(value, undefined, null);
    }
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      performSearch();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    console.log("👋 Blur event", {
      relatedTarget: e.relatedTarget,
      isDropdownFocus: dropdownRef.current?.contains(e.relatedTarget as Node),
    });

    // Don't close if focusing within the dropdown
    if (dropdownRef.current && e.relatedTarget && dropdownRef.current.contains(e.relatedTarget as Node)) {
      console.log("⏸️ Blur ignored - focusing dropdown");
      return;
    }

    // Delay closing to prevent premature closure during rapid typing
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = setTimeout(() => {
      console.log("✅ Closing dropdown on blur (delayed)");
      wasClosedIntentionally.current = true;
      setShowDropdown(false);
      onBlur?.();
    }, 150);
  };

  // Helper function to get display address for a business
  const getBusinessAddress = (business: EnhancedBusiness): string | null => {
    // Only check for address property (the one that exists in Business type)
    return business.address || null;
  };

  // Check if parent is passing app-input class (used in InitiationPage)
  const isAppInputStyle = className.includes("app-input");

  const baseInputClasses =
    variant === "search-bar"
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
            if (disabled) return; // Prevent focus interaction when disabled
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
            if (
              trimmedValue.length > 2 &&
              (searchResults.length > 0 || resultsCache.current.has(trimmedValue) || isSearching)
            ) {
              setShowDropdown(true);
            }
            // Call parent onFocus handler
            onFocus?.();
          }}
          placeholder={placeholder}
          className={`${baseInputClasses} ${className}`}
          disabled={disabled}
          readOnly={disabled}
        />
        {showIcon && variant === "search-bar" && (
          <button
            onClick={performSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-gray-dark transition-colors"
          >
            <Search size={18} />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {!disabled && showDropdown && (searchResults.length > 0 || isSearching || value.trim()) && (
        <div
          className={`absolute ${variant === "search-bar" ? "bottom-full mb-2" : "top-full mt-1"} left-0 right-0 z-[9999]`}
        >
          <div
            ref={dropdownRef}
            className="bg-card shadow-xl border border-border max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
            style={{ borderRadius: "8px" }}
            onScroll={() => {
              isScrolling.current = true;
              setTimeout(() => {
                isScrolling.current = false;
              }, 200);
            }}
          >
            {isSearching ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">Searching...</div>
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
                      {"isNeighborhood" in result && result.isNeighborhood ? (
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
                          {/* Show address if available */}
                          {getBusinessAddress(result as EnhancedBusiness) && (
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {getBusinessAddress(result as EnhancedBusiness)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Divider between results */}
                    {index < searchResults.length - 1 && <div className="h-px bg-border/30 my-1.5"></div>}
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
