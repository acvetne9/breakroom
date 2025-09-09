import React, { useState, useEffect } from 'react';
import MapLibreMap from './MapLibreMap';
import BusinessPreview from './BusinessPreview';
import BusinessDetails from './BusinessDetails';
import BreakroomLoading from './BreakroomLoading';
import UnifiedBusinessSearch from './UnifiedBusinessSearch';
import { EnhancedBusiness } from '@/services/enhancedBusinessSearch';
import { parseSearchFilters } from '@/services/businessFiltering';

import { useToast } from '@/hooks/use-toast';

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
  posts: Post[];
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
  posts,
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
        console.log('🏙️ Setting neighborhood center from trigger:', neighborhoodCoords);
        setNeighborhoodCenter(neighborhoodCoords);
      } else {
        setNeighborhoodCenter(null);
      }
      setSearchFilters(filters);
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
  const landmarks = [
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
  const { toast } = useToast();

  const handleSearchChange = (value: string, business?: EnhancedBusiness, filters?: any, neighborhoodCoords?: { lat: number; lon: number }) => {
    console.log('🔍 Search change in HomePage:', { value, filters, neighborhoodCoords, hasFilters: !!filters });
    setSearchValue(value);
    setSearchFilters(filters);
    
    if (neighborhoodCoords) {
      console.log('🏙️ Setting neighborhood center:', neighborhoodCoords);
      setNeighborhoodCenter(neighborhoodCoords);
    } else {
      setNeighborhoodCenter(null);
    }
    
    if (!value && !filters) {
      console.log('🧹 Search explicitly cleared - removing filters');
      setSearchFilters(null);
      setNeighborhoodCenter(null);
    }
  };

  const handleSearchBusinessSelect = (business: EnhancedBusiness) => {
    const mapBusiness = {
      ...business,
      businessType: business.businessType || business.business_type,
      formatted_address: business.formatted_address || business.vicinity || business.name
    };
    handleBusinessClick(mapBusiness);
    console.log('🔍 Business selected from search - keeping filters active:', searchFilters);
  };

  const handleBusinessClick = (business: any) => {
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
    // Also trigger the onChange to ensure UnifiedBusinessSearch is updated
    handleSearchChange('', undefined, null, undefined);
  };

  // Check if we have an active search (either value or filters)
  const hasActiveSearch = searchValue.trim() !== '' || searchFilters !== null;

  return (
    <div className="relative w-full h-full">
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
          landmarks={landmarks}
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
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-3">
            <UnifiedBusinessSearch
              value={searchValue}
              onChange={handleSearchChange}
              onBusinessSelect={handleSearchBusinessSelect}
              placeholder="Search roles, pay, places, and neighborhoods!"
              variant="search-bar"
              showIcon={!hasActiveSearch} // Hide search icon when there's an active search
              onLocationSave={onLocationSave}
            />
            
            {/* Clear search button (X made of two lines) */}
            {hasActiveSearch && (
              <button
                onClick={handleClearSearch}
                className="w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Clear search"
              >
                <div className="relative w-4 h-4">
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-600 transform -translate-y-1/2 rotate-45"></div>
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-600 transform -translate-y-1/2 -rotate-45"></div>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;