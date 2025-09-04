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

  // 👇 new state for welcome banner
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 6000); // 6 seconds
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  // ... existing code (search handling, business click handlers, etc.)

  return (
    <div className="relative w-full h-full">
      {showLoading && (
        <BreakroomLoading onComplete={() => setShowLoading(false)} />
      )}

      {/* 👇 Welcome banner */}
      {showWelcome && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 w-[90%] max-w-lg">
          <div className="bg-white rounded-2xl shadow-md px-4 py-3 text-center text-sm font-medium border border-gray-200">
            <p>Welcome to breakroom! 🥳</p>
            <p>Click on a yellow dot to discover one of 54k+ businesses</p>
          </div>
        </div>
      )}

      {/* MapLibre with OpenStreetMap base layer */}
      <MapLibreMap
        onBusinessClick={onBusinessSelect}
        selectedBusiness={propSelectedBusiness}
        landmarks={[
          {lat: 40.690331, lng: -74.045414, emoji: "🗽"},
          {lat: 40.75266, lng: -73.97729, emoji: "🚃"},
          // ... rest of landmarks
        ]}
        searchFilters={searchFilters}
        neighborhoodCenter={neighborhoodCenter}
      />

      {/* Business Preview Popup */}
      {propSelectedBusiness && !showBusinessDetails && (
        <BusinessPreview 
          business={propSelectedBusiness}
          posts={posts}
          onClose={() => onBusinessSelect?.(null)}
          onShowDetails={() => setShowBusinessDetails(true)}
          onStoriesClick={() => onBusinessStoriesClick?.(propSelectedBusiness.id)}
        />
      )}

      {/* Business Details Card */}
      {propSelectedBusiness && showBusinessDetails && (
        <BusinessDetails 
          business={propSelectedBusiness}
          posts={posts}
          onClose={() => onBusinessSelect?.(null)}
          onBackToPreview={() => setShowBusinessDetails(false)}
          onStoriesClick={() => onBusinessStoriesClick?.(propSelectedBusiness.id)}
          onPostClick={onPostClick}
          onRoleVote={onRoleVote}
        />
      )}

      {/* Search input bar at bottom */}
      {currentSlide === 1 && currentView === 'main' && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
          <UnifiedBusinessSearch
            value={searchValue}
            onChange={setSearchValue}
            onBusinessSelect={onBusinessSelect}
            placeholder="Search places, roles, pay (e.g. ' barista $15')..."
            variant="search-bar"
            showIcon={true}
            onLocationSave={onLocationSave}
          />
        </div>
      )}
    </div>
  );
};

export default HomePage;
