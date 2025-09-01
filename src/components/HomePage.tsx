import React, { useState, useEffect } from 'react';
import MapLibreMap from './MapLibreMap';
import BusinessPreview from './BusinessPreview';
import BusinessDetails from './BusinessDetails';
import BreakroomLoading from './BreakroomLoading';

import { searchBusinesses } from '../utils/searchUtils';
import { isProfane } from '../utils/profanityFilter';
import { Search } from 'lucide-react';
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
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [showLoading, setShowLoading] = useState(true);

  const handleLoadingComplete = () => {
    setShowLoading(false);
  };
  
  // Use prop-controlled selectedBusiness if available, otherwise use local state
  const selectedBusiness = propSelectedBusiness;
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
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


  const handleSearchInput = (value: string) => {
    setSearchValue(value);
    
    if (value.length === 0) {
      // Clear search results when search is cleared
      setSearchResults([]);
      setIsSearchActive(false);
      return;
    }
    
    // For now, disable search since we're using viewport-based loading
    // TODO: Implement search with viewport businesses or server-side search
    if (value.length > 2) {
      setSearchResults([]); // Temporarily disabled
    } else {
      setSearchResults([]);
    }
  };

  const performSearch = () => {
    if (!searchValue.trim()) return;
    
    // Check for profanity in search terms
    if (isProfane(searchValue)) {
      toast({
        title: "Search blocked",
        description: "Inappropriate search terms detected",
        variant: "destructive"
      });
      setSearchValue(''); // Clear the search input
      return;
    }
    
    // Search functionality temporarily disabled for viewport-based loading
    // TODO: Implement server-side search or integrate with viewport businesses
    toast({
      title: "Search coming soon",
      description: "Search functionality will be available with the new map system",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleBusinessClick = (business: any) => {
    onBusinessSelect?.(business);
    setShowBusinessDetails(false);
    setSearchResults([]);
    
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
          />
        
        
        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
            <div className="app-popup p-4 pb-8 max-h-60 overflow-y-auto rounded-t-lg rounded-b-none border-b-0">
              {searchResults.map(business => (
                <div 
                  key={business.id}
                  className="flex flex-col py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  onClick={() => handleBusinessClick(business)}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{business.name}</span>
                    <span className="text-sm text-app-gray-medium">{business.salary}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      {business.businessType}
                    </span>
                    {business.roles?.slice(0, 2).map((role: any, index: number) => (
                      <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {role.role}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
  
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
            <div className="relative">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search businesses, roles, salary..."
                className="search-bar pr-12"
              />
              <button
                onClick={performSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-gray-dark transition-colors"
              >
                <span>🔍</span>
              </button>
            </div>
          </div>
        )}
        </div>
      
    </div>
  );
};

export default HomePage;