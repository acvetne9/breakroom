import React, { useState, useEffect } from 'react';
import MapLibreMap from './MapLibreMap';
import BusinessPreview from './BusinessPreview';
import BusinessDetails from './BusinessDetails';
import BreakroomLoading from './BreakroomLoading';
import UnifiedBusinessSearch from './UnifiedBusinessSearch';
import { EnhancedBusiness } from '@/services/enhancedBusinessSearch';
import { parseSearchFilters } from '@/services/businessFiltering';
import { useToast } from '@/hooks/use-toast';

// Move landmarks outside component to prevent recreation on every render
const LANDMARKS = [
  {lat: 40.690331, lng: -74.045414, emoji: "🗽"},
  {lat: 40.75266, lng: -73.97729, emoji: "🚃"},
  {lat: 40.75058, lng: -73.99358, emoji: "🚃"},
  {lat: 40.548575, lng: -74.0321778, emoji: "🐬"},
  {lat: 40.547303, lng: -73.794261, emoji: "🦈"},
  {lat: 40.869180, lng: -73.755437, emoji: "🐠"},
  {lat: 40.781713, lng: -73.966566, emoji: "🪁"},
  {lat: 40.641540, lng: -73.772358, emoji: "✈️"},
  {lat: 40.777721, lng: -73.875939, emoji: "✈️"},
  {lat: 40.756317, lng: -73.847403, emoji: "🏟️"},
  {lat: 40.830000, lng: -73.926208, emoji: "🏟️"},
  {lat: 40.45022, lng: -73.59364, emoji: "🏟️"},
  {lat: 40.683047, lng: -73.975912, emoji: "🏟️"},
  {lat: 40.759111, lng: -73.985294, emoji: "🎼"},
  {lat: 40.669823, lng: -73.965892, emoji: "🌼"},
  {lat: 40.572445, lng: -73.983244, emoji: "🎡"},
  {lat: 40.577249, lng: -73.837034, emoji: "🏖️"},
  {lat: 40.574829, lng: -73.959530, emoji: "🏖️"},
  {lat: 40.573527, lng: -74.082761, emoji: "🏖️"},
  {lat: 40.708890, lng: -74.008396, emoji: "🏦"},
  {lat: 40.850103, lng: -73.876716, emoji: "🐾"},
  {lat: 40.625569, lng: -74.115425, emoji: "🐾"},
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
  currentView?: 'initiation' | 'main';
  selectedBusiness?: any;
  onBusinessSelect?: (business: any) => void;
  posts?: Post[];
  onBusinessStoriesClick?: (businessId: string) => void;
  onPostClick?: (post: Post) => void;
  onRoleVote?: (businessId: string, roleIndex: number, voteType: 'up' | 'down') => void;
  onLocationSave?: (location: string, fullLocation: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ 
  currentSlide = 1,
  currentView = 'main',
  selectedBusiness: propSelectedBusiness,
  onBusinessSelect,
  posts = [],
  onBusinessStoriesClick,
  onPostClick,
  onRoleVote,
  onLocationSave
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [searchFilters, setSearchFilters] = useState<any>(null);
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [searchCompleted, setSearchCompleted] = useState(false); // Track if a search has been completed

  // 👇 state for welcome banner
  const [showWelcome, setShowWelcome] = useState(false);

  // Listen for search triggers from other pages
  useEffect(() => {
    const handleSearchTrigger = (event: CustomEvent) => {
      const searchTerm = event.detail;
      console.log('🔍 [triggerSearch] Received search trigger:', searchTerm);
      setSearchValue(searchTerm);
      
      const filters = parseSearchFilters(searchTerm);
      console.log('🔍 [triggerSearch] Parsed filters:', filters);
      
      if (filters?.neighborhoodFilter) {
        const neighborhoodCoords = {
          lat: filters.neighborhoodFilter.center.lat,
          lon: filters.neighborhoodFilter.center.lon
        };
        setNeighborhoodCenter(neighborhoodCoords);

      }
      setSearchFilters(filters);
      setSearchCompleted(true); // Mark search as completed
    };

    window.addEventListener('triggerSearch', handleSearchTrigger as EventListener);
    return () => window.removeEventListener('triggerSearch', handleSearchTrigger as EventListener);
  }, []);

  // 👇 when loading completes, mark it closed
  const handleLoadingComplete = () => {
    setShowLoading(false);
  };

  // 👇 Show welcome banner ONLY after initiation card closes
  useEffect(() => {
    if (!showLoading && currentView === 'main') {
      const timer1 = setTimeout(() => {
        setShowWelcome(true);
        const timer2 = setTimeout(() => setShowWelcome(false), 6000);
        return () => clearTimeout(timer2);
      }, 500); // small delay to avoid overlap
      return () => clearTimeout(timer1);
    }
  }, [showLoading, currentView]);
  
  const selectedBusiness = propSelectedBusiness;
  const { toast } = useToast();

  const handleSearchChange = (
    value: string,
    business?: EnhancedBusiness,
    filters?: any,
    neighborhoodCoords?: { lat: number; lon: number }
  ) => {
    console.log("🔍 Search change in HomePage:", { value, filters });
  
    setSearchValue(value);
  
    // Always re-parse if filters weren’t passed from child
    const parsedFilters = filters || parseSearchFilters(value);
  
    setSearchFilters(parsedFilters);
  
    if (parsedFilters?.neighborhoodFilter?.center) {
      setNeighborhoodCenter(parsedFilters.neighborhoodFilter.center);
    } else {
      setNeighborhoodCenter(null);
    }
  
    setSearchCompleted(!!value.trim() || parsedFilters !== null);
  
    if (!value && !parsedFilters) {
      console.log("🧹 Search explicitly cleared - removing filters");
      setSearchFilters(null);
      setNeighborhoodCenter(null);
      setSearchCompleted(false);
    }
  };


  const handleSearchBusinessSelect = (business: EnhancedBusiness) => {
    console.log('🔍 DEBUG: handleSearchBusinessSelect deps check', { 
      searchFilters: typeof searchFilters 
    });
    const mapBusiness = {
      ...business,
      businessType: business.businessType || business.business_type,
      formatted_address: business.formatted_address || business.vicinity || business.name
    };
    handleBusinessClick(mapBusiness);
    console.log('🔍 Business selected from search - keeping filters active:', searchFilters);
  };

  const handleBusinessClick = (business: any) => {
    console.log('🔍 DEBUG: handleBusinessClick deps check', { 
      onBusinessSelect: typeof onBusinessSelect,
      onLocationSave: typeof onLocationSave 
    });
    onBusinessSelect?.(business);
    setShowBusinessDetails(false);
    
    if (onLocationSave && business.name) {
      const fullLocation = business.formatted_address || business.vicinity || business.name;
      onLocationSave(business.name, fullLocation);
    }
  };

  const handleShowBusinessDetails = () => {
    setShowBusinessDetails(true);
  };

  const handleBusinessStoriesClick = () => {
    onBusinessStoriesClick?.(selectedBusiness.id);
  };

  const handleClosePreview = () => {
    onBusinessSelect?.(null);
    setShowBusinessDetails(false);
  };

  const handleBackToPreview = () => {
    setShowBusinessDetails(false);
  };

  // 👇 New function to clear search
  const handleClearSearch = () => {
    console.log('🧹 Clearing search from X button');
    setSearchValue('');
    setSearchFilters(null);
    setNeighborhoodCenter(null);
    setSearchCompleted(false); // Reset search completed state
    // Also trigger the onChange to ensure UnifiedBusinessSearch is updated
    handleSearchChange('', undefined, null, undefined);
  };

  // Check if we have an active search (either value or filters) AND search has been completed
  const hasActiveSearch = searchValue.trim() !== '' || searchFilters !== null;
  const showClearButton = searchCompleted && hasActiveSearch;

  useEffect(() => {
    const handleResize = () => {
      const mapContainer = document.querySelector('.maplibregl-map') as HTMLElement;
      if (mapContainer) {
        // MapLibre attaches the map instance to the container
        // @ts-ignore
        const map = mapContainer?.__map__ || mapContainer?.map;
        if (map && typeof map.resize === 'function') {
          map.resize();
        }
      }
    };
  
    window.addEventListener('resize', handleResize);
    handleResize();
  
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return (
    <div className="absolute inset-0 w-full h-full min-w-[200px] min-h-[200px]">
      {showLoading && (
        <BreakroomLoading onComplete={handleLoadingComplete} />
      )}

      {/* 👇 Welcome banner only appears AFTER initiation card closes */}
      {showWelcome && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 w-[90%] max-w-lg transition-opacity duration-700">
          <div className="bg-white rounded-2xl shadow-md px-4 py-3 text-center text-sm font-medium border border-gray-200">
            <p>Welcome to breakroom!</p>
            <p>Click on one a yellow dot to discover one of 54k businesses</p>
          </div>
        </div>
      )}

      <div>
        {/* MapLibre with OpenStreetMap base layer */}
        <MapLibreMap
          onBusinessClick={handleBusinessClick}
          selectedBusiness={selectedBusiness}
          landmarks={LANDMARKS}
          searchFilters={searchFilters}
          neighborhoodCenter={neighborhoodCenter}
        />
      
        {/* Business Preview Popup */}
        {selectedBusiness && !showBusinessDetails && (
          <BusinessPreview 
            business={selectedBusiness}
            posts={posts}
            onClose={handleClosePreview}
            onShowDetails={handleShowBusinessDetails}
            onStoriesClick={handleBusinessStoriesClick}
          />
        )}
  
        {/* Business Details Card */}
        {selectedBusiness && showBusinessDetails && (
          <BusinessDetails 
            business={selectedBusiness}
            posts={posts}
            onClose={handleClosePreview}
            onBackToPreview={handleBackToPreview}
            onStoriesClick={() => onBusinessStoriesClick?.(selectedBusiness.id)}
            onPostClick={onPostClick}
            onRoleVote={onRoleVote}
          />
        )}

        {/* Search input bar at bottom */}
        {currentSlide === 1 && currentView === 'main' && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
            <div className="relative">
              <UnifiedBusinessSearch
                value={searchValue}
                onChange={handleSearchChange}
                onBusinessSelect={handleSearchBusinessSelect}
                placeholder="Find that next gig!"
                variant="search-bar"
                showIcon={!showClearButton} // Hide search icon when clear button should show
                onLocationSave={onLocationSave}
              />
              
              {/* Clear search button (X) that replaces the search icon */}
              {showClearButton && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
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
    </div>
  );
};

export default HomePage;