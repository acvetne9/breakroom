import React, { useState, useEffect, useMemo, useCallback } from "react";
import MapLibreMap from "./MapLibreMap";
import BusinessPreview from "./BusinessPreview";
import BusinessDetails from "./BusinessDetails";
import BreakroomLoading from "./BreakroomLoading";
import UnifiedBusinessSearch from "./UnifiedBusinessSearch";
import { EnhancedBusiness } from "@/types/search";
import { parseSearchFilters } from "@/services/businessFiltering";
import { clearSearchCache } from "@/services/unifiedSearch";

const LANDMARKS = [
  { lat: 40.690331, lng: -74.045414, emoji: "🗽" },
  { lat: 40.75266, lng: -73.97729, emoji: "🚃" },
  { lat: 40.75058, lng: -73.99358, emoji: "🚃" },
  { lat: 40.548575, lng: -74.0321778, emoji: "🐬" },
  { lat: 40.547303, lng: -73.794261, emoji: "🦈" },
  { lat: 40.86918, lng: -73.755437, emoji: "🐠" },
  { lat: 40.781713, lng: -73.966566, emoji: "🪁" },
  { lat: 40.64154, lng: -73.772358, emoji: "✈️" },
  { lat: 40.777721, lng: -73.875939, emoji: "✈️" },
  { lat: 40.756317, lng: -73.847403, emoji: "🏟️" },
  { lat: 40.83, lng: -73.926208, emoji: "🏟️" },
  { lat: 40.45022, lng: -73.59364, emoji: "🏟️" },
  { lat: 40.683047, lng: -73.975912, emoji: "🏟️" },
  { lat: 40.759111, lng: -73.985294, emoji: "🎼" },
  { lat: 40.669823, lng: -73.965892, emoji: "🌼" },
  { lat: 40.572445, lng: -73.983244, emoji: "🎡" },
  { lat: 40.577249, lng: -73.837034, emoji: "🏖️" },
  { lat: 40.574829, lng: -73.95953, emoji: "🏖️" },
  { lat: 40.573527, lng: -74.082761, emoji: "🏖️" },
  { lat: 40.70889, lng: -74.008396, emoji: "🏦" },
  { lat: 40.850103, lng: -73.876716, emoji: "🐾" },
  { lat: 40.625569, lng: -74.115425, emoji: "🐾" },
];

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  createdAt: Date;
}

interface HomePageProps {
  currentSlide?: number;
  currentView?: "initiation" | "main";
  selectedBusiness?: any;
  onBusinessSelect?: (business: any) => void;
  posts?: Post[];
  onBusinessStoriesClick?: (businessId: string) => void;
  onPostClick?: (post: Post) => void;
  onRoleVote?: (businessId: string, roleIndex: number, voteType: "up" | "down") => void;
  onLocationSave?: (location: string, fullLocation: string) => void;
  votingRoles?: Set<string>;
  showBusinessDetails?: boolean;
  onShowBusinessDetails?: () => void;
  onBackToPreview?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({
  currentSlide = 1,
  currentView = "main",
  onBackToPreview,
  selectedBusiness: propSelectedBusiness,
  onBusinessSelect,
  posts = [],
  onBusinessStoriesClick,
  onPostClick,
  onRoleVote,
  onLocationSave,
  votingRoles,
  showBusinessDetails: propShowBusinessDetails = false,
  onShowBusinessDetails,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [mapDataReady, setMapDataReady] = useState(false);
  const [businessDataReady, setBusinessDataReady] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [mapBusinesses, setMapBusinesses] = useState<any[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);

  // Computed loading state - show overlay until all three complete
  const showLoadingOverlay = !animationComplete || !mapDataReady || !businessDataReady;

  // Debounce search value updates (2 seconds as requested)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchValue(searchValue);
    }, 2000);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Handle Enter key to trigger immediate search
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        setDebouncedSearchValue(searchValue);
      }
    },
    [searchValue],
  );

  // Memoize searchFilters to prevent recreation on every render
  const searchFilters = useMemo(() => {
    if (!debouncedSearchValue.trim()) return null;
    const filters = parseSearchFilters(debouncedSearchValue);

    if (filters?.neighborhoodFilter?.center) {
      setNeighborhoodCenter(filters.neighborhoodFilter.center);
    }

    return filters;
  }, [debouncedSearchValue]);

  // Listen for search triggers from other pages
  useEffect(() => {
    const handleSearchTrigger = (event: CustomEvent) => {
      const searchTerm = event.detail;
      console.log("🔍 [triggerSearch] Received search trigger:", searchTerm);
      clearSearchCache();
      setSearchValue(searchTerm);
      setSearchCompleted(true);
    };

    window.addEventListener("triggerSearch", handleSearchTrigger as EventListener);
    return () => window.removeEventListener("triggerSearch", handleSearchTrigger as EventListener);
  }, []);

  const handleLoadingComplete = () => {
    setAnimationComplete(true);
  };

  const handleMapLoaded = () => {
    setMapDataReady(true);
  };

  const handleBusinessesLoaded = () => {
    setBusinessDataReady(true);
  };

  useEffect(() => {
    if (!showLoadingOverlay && currentView === "main") {
      const timer1 = setTimeout(() => {
        setShowWelcome(true);
        const timer2 = setTimeout(() => setShowWelcome(false), 6000);
        return () => clearTimeout(timer2);
      }, 500);
      return () => clearTimeout(timer1);
    }
  }, [showLoadingOverlay, currentView]);

  const selectedBusiness = propSelectedBusiness;

  const handleSearchChange = useCallback(
    (value: string, business?: EnhancedBusiness, filters?: any, neighborhoodCoords?: { lat: number; lon: number }) => {
      console.log("🔍 Search change in HomePage:", { value });

      if (value.trim()) {
        clearSearchCache();
      }

      setSearchValue(value);
      setSearchCompleted(!!value.trim());

      if (!value.trim()) {
        console.log("🧹 Search cleared");
        setNeighborhoodCenter(null);
        setSearchCompleted(false);
      }
    },
    [],
  );

  const handleSearchBusinessSelect = (business: EnhancedBusiness) => {
    console.log("🔍 DEBUG: handleSearchBusinessSelect deps check", {
      hasSearchFilters: !!searchFilters,
    });
    const mapBusiness = {
      ...business,
      businessType: business.businessType || business.business_type,
      formatted_address: business.formatted_address || business.vicinity || business.name,
    };

    if (business?.position?.lat && business?.position?.lng) {
      window.dispatchEvent(
        new CustomEvent("flyToBusiness", {
          detail: {
            lat: business.position.lat,
            lng: business.position.lng,
            business: mapBusiness,
          },
        }),
      );
    }

    handleBusinessClick(mapBusiness);
    console.log("🔍 Business selected from search - keeping filters active:", searchFilters);
  };

  const handleBusinessClick = (business: any) => {
    console.log("🏠 HomePage handleBusinessClick called:", business?.name);
    console.log("🔍 DEBUG: handleBusinessClick deps check", {
      onBusinessSelect: typeof onBusinessSelect,
      onLocationSave: typeof onLocationSave,
    });
    onBusinessSelect?.(business);

    if (onLocationSave && business.name) {
      const fullLocation = business.formatted_address || business.vicinity || business.name;
      onLocationSave(fullLocation, fullLocation);
    }
  };

  const handleShowBusinessDetails = () => {
    onShowBusinessDetails?.();
  };

  const handleBusinessStoriesClick = () => {
    onBusinessStoriesClick?.(selectedBusiness.id);
  };

  const handleClosePreview = () => {
    onBusinessSelect?.(null);
  };

  const handleBackToPreview = () => {
    onBackToPreview?.();
  };

  const showBusinessDetails = propShowBusinessDetails;

  const handleClearSearch = useCallback(() => {
    console.log("🧹 Clearing search from X button");
    setSearchValue("");
    setDebouncedSearchValue("");
    setNeighborhoodCenter(null);
    setSearchCompleted(false);
  }, []);

  const hasActiveSearch = searchValue.trim() !== "" || searchFilters !== null;
  const showClearButton = searchCompleted && hasActiveSearch;

  useEffect(() => {
    const handleResize = () => {
      const mapContainer = document.querySelector(".maplibregl-map") as HTMLElement;
      if (mapContainer) {
        // @ts-ignore
        const map = mapContainer?.__map__ || mapContainer?.map;
        if (map && typeof map.resize === "function") {
          map.resize();
        }
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className="absolute inset-0 w-full h-full min-w-[200px] min-h-[200px]"
      style={{
        pointerEvents: currentSlide !== 1 ? "none" : "auto",
        touchAction: currentSlide !== 1 ? "none" : "auto",
      }}
    >
      {/* Map renders immediately but hidden behind loading screen */}
      <div className="absolute inset-0" style={{ pointerEvents: currentSlide !== 1 ? "none" : "auto" }}>
        <MapLibreMap
          onBusinessClick={handleBusinessClick}
          selectedBusiness={selectedBusiness}
          landmarks={LANDMARKS}
          searchFilters={searchFilters}
          neighborhoodCenter={neighborhoodCenter}
          onBusinessesUpdate={setMapBusinesses}
          onMapLoaded={handleMapLoaded}
          onBusinessesLoaded={handleBusinessesLoaded}
        />
      </div>

      {/* Loading overlay on top */}
      {showLoadingOverlay && <BreakroomLoading onComplete={handleLoadingComplete} />}

      {showWelcome && !showLoadingOverlay && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 w-[90%] max-w-lg transition-opacity duration-700">
          <div className="bg-white rounded-2xl shadow-md px-4 py-3 text-center text-sm font-medium border border-gray-200">
            <p>Welcome to breakroom!</p>
            <p>Click on a yellow dot to discover one of 54k businesses</p>
          </div>
        </div>
      )}

      {!showLoadingOverlay && (
        <div>
          {selectedBusiness && !showBusinessDetails && (
            <BusinessPreview
              business={selectedBusiness}
              posts={posts}
              onClose={handleClosePreview}
              onShowDetails={handleShowBusinessDetails}
              onStoriesClick={handleBusinessStoriesClick}
            />
          )}

          {selectedBusiness && showBusinessDetails && (
            <BusinessDetails
              business={selectedBusiness}
              posts={posts}
              onClose={handleClosePreview}
              onBackToPreview={handleBackToPreview}
              onStoriesClick={() => onBusinessStoriesClick?.(selectedBusiness.id)}
              onPostClick={onPostClick}
              onRoleVote={onRoleVote}
              votingRoles={votingRoles}
            />
          )}

          {currentSlide === 1 && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
              <div className="relative">
                <UnifiedBusinessSearch
                  value={searchValue}
                  onChange={handleSearchChange}
                  onBusinessSelect={handleSearchBusinessSelect}
                  placeholder="Find that next gig!"
                  variant="search-bar"
                  showIcon={!showClearButton}
                  onLocationSave={onLocationSave}
                  mapBusinesses={mapBusinesses}
                />

                {showClearButton && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 w-11 h-11 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Clear search"
                  >
                    <div className="relative w-3 h-3">
                      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-600 transform -translate-y-1/2 rotate-45"></div>
                      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-600 transform -translate-y-1/2 -rotate-45"></div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HomePage;
