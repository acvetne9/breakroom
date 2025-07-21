import React, { useState, useEffect } from 'react';
import GoogleMap from './GoogleMap';
import BusinessPreview from './BusinessPreview';
import BusinessDetails from './BusinessDetails';
import { searchBusinesses } from '../utils/searchUtils';
import { isProfane } from '../utils/profanityFilter';
import { Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface HomePageProps {
  businesses: Array<{
    id: string;
    name: string;
    position: { lat: number; lng: number };
    rating: number;
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
    businessType?: string;
    roles?: Array<{ role: string; salary: string }>;
  }>;
  currentSlide?: number;
}

const HomePage: React.FC<HomePageProps> = ({ 
  businesses, 
  currentSlide = 1
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState(businesses);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const { toast } = useToast();

  // Update filtered businesses when businesses prop changes
  useEffect(() => {
    if (!isSearchActive) {
      setFilteredBusinesses(businesses);
    }
  }, [businesses, isSearchActive]);

  const handleSearchInput = (value: string) => {
    setSearchValue(value);
    
    if (value.length === 0) {
      // Restore all businesses when search is cleared
      setSearchResults([]);
      setFilteredBusinesses(businesses);
      setIsSearchActive(false);
      return;
    }
    
    if (value.length > 2) {
      const { filteredBusinesses: filtered } = searchBusinesses(businesses, value);
      setSearchResults(filtered.slice(0, 5)); // Show top 5 results in dropdown
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
    
    const { filteredBusinesses: filtered, exactMatch } = searchBusinesses(businesses, searchValue);
    
    if (exactMatch) {
      // Navigate directly to the exact match
      setSelectedBusiness(exactMatch);
      setShowBusinessDetails(false);
      setSearchResults([]);
      setFilteredBusinesses([exactMatch]);
      setIsSearchActive(true);
    } else {
      // Show filtered results
      setFilteredBusinesses(filtered);
      setSearchResults([]);
      setIsSearchActive(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleBusinessClick = (business: any) => {
    setSelectedBusiness(business);
    setShowBusinessDetails(false);
    setSearchResults([]);
  };

  const handleBusinessPreviewClick = () => {
    setShowBusinessDetails(true);
  };

  const handleClosePreview = () => {
    setSelectedBusiness(null);
    setShowBusinessDetails(false);
  };

  return (
    <div className="relative w-full h-full">
      {/* Google Maps base layer */}
      <GoogleMap 
        businesses={filteredBusinesses}
        onBusinessClick={handleBusinessClick}
        selectedBusiness={selectedBusiness}
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
          onClose={handleClosePreview}
          onClick={handleBusinessPreviewClick}
        />
      )}

      {/* Business Details Card */}
      {selectedBusiness && showBusinessDetails && (
        <BusinessDetails 
          business={selectedBusiness}
          onClose={handleClosePreview}
        />
      )}

      {/* Search input bar at bottom - only show on home slide */}
      {currentSlide === 1 && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
          <div className="relative">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search businesses, industries..."
              className="search-bar pr-12"
            />
            <button
              onClick={performSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-gray-dark transition-colors"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
