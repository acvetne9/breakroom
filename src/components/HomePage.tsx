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
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [showLoading, setShowLoading] = useState(true);

  // Listen for search triggers from other pages
  useEffect(() => {
    const handleSearchTrigger = (event: CustomEvent) => {
      const searchTerm = event.detail;
      console.log('🔍 [triggerSearch] Received search trigger:', searchTerm);
      setSearchValue(searchTerm);
      
      // Parse the search term to generate proper filters, just like UnifiedBusinessSearch does
      const filters = parseSearchFilters(searchTerm);
      console.log('🔍 [triggerSearch] Parsed filters:', filters);
      
      // Apply the filters to the map
      setSearchFilters(filters);
    };

    window.addEventListener('triggerSearch', handleSearchTrigger as EventListener);
    return () => window.removeEventListener('triggerSearch', handleSearchTrigger as EventListener);
  }, []);

  const handleLoadingComplete = () => {
    setShowLoading(false);
  };
  
  // Use prop-controlled selectedBusiness if available, otherwise use local state
  const selectedBusiness = propSelectedBusiness;
  const landmarks = [
    {lat: 40.690331, lng: -74.045414, emoji: "🗽"},
    //{lat: 40.705330, lng: -73.995885, emoji: "🌉"},
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
     
]
  const { toast } = useToast();

  const handleSearchChange = (value: string, business?: EnhancedBusiness, filters?: any) => {
    console.log('🔍 Search change in HomePage:', { value, filters, hasFilters: !!filters });
    setSearchValue(value);
    setSearchFilters(filters);
    
    // Only clear filters when search is explicitly cleared (empty value and no filters)
    if (!value && !filters) {
      console.log('🧹 Search explicitly cleared - removing filters');
      setSearchFilters(null);
    }
  };

  const handleSearchBusinessSelect = (business: EnhancedBusiness) => {
    // Convert EnhancedBusiness to the format expected by the map
    const mapBusiness = {
      ...business,
      businessType: business.businessType || business.business_type,
      formatted_address: business.formatted_address || business.vicinity || business.name
    };
    handleBusinessClick(mapBusiness);
    // Keep search value visible after selection
    // Don't clear search filters - keep them active so user continues to see filtered results
    console.log('🔍 Business selected from search - keeping filters active:', searchFilters);
  };

  const handleBusinessClick = (business: any) => {
    onBusinessSelect?.(business);
    setShowBusinessDetails(false);
    
    // Save the clicked business location
    if (onLocationSave && business.name) {
      // Use business name as location, and try to construct a fuller address if available
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

  return (
    <div className="relative w-full h-full">
      {showLoading && (
        <BreakroomLoading onComplete={handleLoadingComplete} />
      )}
        <div>
          
          {/* MapLibre with OpenStreetMap base layer */}
          <MapLibreMap
            onBusinessClick={handleBusinessClick}
            selectedBusiness={selectedBusiness}
            landmarks={landmarks}
            searchFilters={searchFilters}
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

        {/* Search input bar at bottom - only show on home slide and not during initiation */}
        {currentSlide === 1 && currentView === 'main' && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
            <UnifiedBusinessSearch
              value={searchValue}
              onChange={handleSearchChange}
              onBusinessSelect={handleSearchBusinessSelect}
              placeholder="Search places, roles, pay (e.g. 'Starbucks barista $15', 'manager $20+')..."
              variant="search-bar"
              showIcon={true}
              onLocationSave={onLocationSave}
            />
          </div>
        )}
        </div>
      
    </div>
  );
};

export default HomePage;