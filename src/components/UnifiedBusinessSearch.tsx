import React, { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useDropdown } from "@/hooks/useDropdown";
import { EnhancedBusiness } from "@/types/search";
import { isProfane } from "@/utils/profanityFilter";
import { parseSearchQuery, searchBusinesses, type SearchResult } from "@/services/search";

interface UnifiedBusinessSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter key, or picking a neighborhood: the parent should apply the query now. */
  onSubmit?: (value: string) => void;
  onBusinessSelect?: (business: EnhancedBusiness) => void;
  onNoResults?: (query: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  variant?: "dropdown" | "search-bar";
  showIcon?: boolean;
  onLocationSave?: (location: string, fullLocation: string) => void;
  disabled?: boolean;
}

interface NeighborhoodResult {
  id: string;
  name: string;
  isNeighborhood: true;
  borough: string;
}

type DropdownItem = (EnhancedBusiness & { matchReasons?: string[] }) | NeighborhoodResult;

const MIN_QUERY_LENGTH = 3;
const DROPDOWN_LIMIT = 30;

const reasonLabel = (reasons: string[] | undefined) => {
  if (!reasons?.length) return null;
  const r = reasons.filter((x) => x !== "neighborhood" && x !== "pay");
  if (r.includes("role")) return "has this role";
  if (r.includes("similar name")) return "similar name";
  if (r.includes("address")) return "address";
  return null;
};

const toEnhanced = (b: SearchResult): EnhancedBusiness & { matchReasons: string[] } => ({
  ...b,
  lat: b.position.lat,
  lng: b.position.lng,
  roles: (b.roles ?? []).map((r) => ({ id: r.id ?? "", role: r.role, salary: r.salary, votesTotal: r.votesTotal, userVote: r.userVote })),
  matchReasons: b.matchReasons,
});

const UnifiedBusinessSearch: React.FC<UnifiedBusinessSearchProps> = ({
  value,
  onChange,
  onSubmit,
  onBusinessSelect,
  onNoResults,
  onBlur,
  onFocus,
  placeholder = "Search businesses, roles, salary...",
  className = "",
  variant = "dropdown",
  showIcon = false,
  onLocationSave,
  disabled = false,
}) => {
  const [items, setItems] = useState<DropdownItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const isScrolling = useRef(false);
  const searchSeqRef = useRef(0);
  const resultsCache = useRef<Map<string, DropdownItem[]>>(new Map());
  const wasClosedIntentionally = useRef(false);
  const hasUserInteracted = useRef(false);

  const {
    isOpen: showDropdown,
    setIsOpen: setShowDropdown,
    triggerRef: inputRef,
    dropdownRef,
    scheduleBlurClose,
    cancelBlurClose,
  } = useDropdown({
    shouldIgnoreOutsideClick: () => isScrolling.current,
    onOutsideClose: () => {
      wasClosedIntentionally.current = true;
    },
    onBlurClose: () => {
      wasClosedIntentionally.current = true;
      onBlur?.();
    },
  });

  // Typeahead: parse, then ask the database. Neighborhood matches go first.
  useEffect(() => {
    if (disabled) return;
    const q = value.trim();

    if (q.length < MIN_QUERY_LENGTH) {
      setItems([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }
    if (!hasUserInteracted.current && variant === "dropdown") return;

    const cached = resultsCache.current.get(q);
    if (cached) {
      setItems(cached);
      if (!wasClosedIntentionally.current) setShowDropdown(true);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (!wasClosedIntentionally.current) setShowDropdown(true);
    const seq = ++searchSeqRef.current;

    const timer = setTimeout(async () => {
      try {
        const filters = parseSearchQuery(q);
        const next: DropdownItem[] = [];

        if (filters?.neighborhood) {
          next.push({
            id: `neighborhood-${filters.neighborhood.name}`,
            name: filters.neighborhood.name,
            isNeighborhood: true,
            borough: filters.neighborhood.borough,
          });
        }

        if (filters && (filters.terms.length > 0 || filters.salary)) {
          const results = await searchBusinesses(filters, { limit: DROPDOWN_LIMIT });
          if (seq !== searchSeqRef.current) return;
          next.push(...results.map(toEnhanced));
        }

        resultsCache.current.set(q, next);
        if (resultsCache.current.size > 50) {
          const firstKey = resultsCache.current.keys().next().value;
          if (firstKey) resultsCache.current.delete(firstKey);
        }
        setItems(next);

        if (onNoResults && !next.some((r) => !("isNeighborhood" in r))) {
          setTimeout(() => {
            if (seq === searchSeqRef.current && value.trim() === q) onNoResults(q);
          }, 800);
        }
      } catch (error) {
        console.error("Search error:", error);
        if (seq === searchSeqRef.current) setItems([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    hasUserInteracted.current = true;
    wasClosedIntentionally.current = false;
    onChange(e.target.value);
  };

  const handleResultClick = (item: DropdownItem) => {
    if (disabled) return;
    cancelBlurClose();

    if ("isNeighborhood" in item) {
      onChange(item.name);
      onSubmit?.(item.name);
    } else {
      const business = item as EnhancedBusiness;
      if (onBusinessSelect) onBusinessSelect(business);
      else onChange(business.name);
      if (onLocationSave && business.name) {
        const fullLocation = business.formatted_address || business.vicinity || business.name;
        onLocationSave(fullLocation, fullLocation);
      }
    }

    wasClosedIntentionally.current = true;
    setShowDropdown(false);
    setItems([]);
  };

  const handleSubmit = () => {
    const q = value.trim();
    if (q && isProfane(q)) return;
    onSubmit?.(q);
    setShowDropdown(false);
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (dropdownRef.current && e.relatedTarget && dropdownRef.current.contains(e.relatedTarget as Node)) return;
    scheduleBlurClose();
  };

  const isAppInputStyle = className.includes("app-input");
  const baseInputClasses =
    variant === "search-bar"
      ? "search-bar pr-12"
      : isAppInputStyle
        ? ""
        : "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  const hasQuery = value.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          onFocus={() => {
            if (disabled) return;
            cancelBlurClose();
            hasUserInteracted.current = true;
            wasClosedIntentionally.current = false;
            if (hasQuery && (items.length > 0 || resultsCache.current.has(value.trim()) || isSearching)) setShowDropdown(true);
            onFocus?.();
          }}
          placeholder={placeholder}
          className={`${baseInputClasses} ${className}`}
          disabled={disabled}
          readOnly={disabled}
          aria-label={placeholder}
        />
        {showIcon && variant === "search-bar" && (
          <button
            onClick={handleSubmit}
            aria-label="Search"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-gray-dark transition-colors"
          >
            <Search size={18} />
          </button>
        )}
      </div>

      {!disabled && showDropdown && hasQuery && (
        <div className={`absolute ${variant === "search-bar" ? "bottom-full mb-2" : "top-full mt-1"} left-0 right-0 z-[9999]`}>
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
            {isSearching && items.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">Searching...</div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">No relevant businesses found</div>
            ) : (
              <div className="p-3">
                {items.map((item) => (
                  <div key={item.id} className="cursor-pointer py-1.5 px-0 rounded transition-colors hover:bg-accent/20" onClick={() => handleResultClick(item)}>
                    {"isNeighborhood" in item ? (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs opacity-70">{item.borough} · all businesses</span>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-medium truncate">{item.name}</span>
                          <span className="text-sm opacity-70 whitespace-nowrap">
                            {item.businessType === "Other" ? "" : item.businessType || "Business"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          {item.address && <span className="text-xs text-muted-foreground truncate mt-0.5">{item.address}</span>}
                          {reasonLabel(item.matchReasons) && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">{reasonLabel(item.matchReasons)}</span>
                          )}
                        </div>
                      </div>
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
