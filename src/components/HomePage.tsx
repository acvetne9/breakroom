import React, { useState } from 'react';
import GoogleMap from './GoogleMap';
import BusinessPreview from './BusinessPreview';
import BusinessDetails from './BusinessDetails';

interface HomePageProps {
  businesses: Array<{
    id: string;
    name: string;
    position: { lat: number; lng: number };
    rating: number;
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
  }>;
  currentSlide?: number;
  expandedPost?: string | null;
  onPostSubmit?: (text: string) => void;
  onCommentSubmit?: (comment: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ 
  businesses, 
  currentSlide = 1, 
  expandedPost,
  onPostSubmit,
  onCommentSubmit 
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [postText, setPostText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = (value: string) => {
    setSearchValue(value);
    
    if (value.length > 2) {
      const filtered = businesses.filter(business => 
        business.name.toLowerCase().includes(value.toLowerCase())
      );
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  };

  const handleBusinessClick = (business: any) => {
    setSelectedBusiness(business);
    setShowBusinessDetails(false);
  };

  const handleBusinessPreviewClick = () => {
    setShowBusinessDetails(true);
  };

  const handleClosePreview = () => {
    setSelectedBusiness(null);
    setShowBusinessDetails(false);
  };

  const handlePostSubmit = () => {
    if (postText.trim() && onPostSubmit) {
      onPostSubmit(postText);
      setPostText('');
    }
  };

  const handleCommentSubmit = () => {
    if (commentText.trim() && onCommentSubmit) {
      onCommentSubmit(commentText);
      setCommentText('');
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Google Maps base layer */}
      <GoogleMap 
        businesses={businesses}
        onBusinessClick={handleBusinessClick}
        selectedBusiness={selectedBusiness}
      />
      
      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
          <div className="app-popup p-4 pb-8 max-h-60 overflow-y-auto rounded-t-lg rounded-b-none border-b-0">
            {searchResults.map(business => (
              <div 
                key={business.id}
                className="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50"
                onClick={() => handleBusinessClick(business)}
              >
                <span className="font-medium">{business.name}</span>
                <span className="text-sm text-app-gray-medium">{business.salary}</span>
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

      {/* Search/Post/Comment bar at bottom */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        {currentSlide === 2 ? (
          expandedPost ? (
            // Comment input when post is expanded
            <div className="relative">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="search-bar pr-14"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCommentSubmit();
                  }
                }}
              />
              <button 
                onClick={handleCommentSubmit} 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
              >
                🗣️
              </button>
            </div>
          ) : (
            // Post input for explore page
            <div className="relative">
              <input
                type="text"
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="What's happening at work?"
                className="search-bar pr-14"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handlePostSubmit();
                  }
                }}
              />
              <button 
                onClick={handlePostSubmit} 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
              >
                🗣️
              </button>
            </div>
          )
        ) : (
          // Search input for home page
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search businesses, industries..."
            className="search-bar"
          />
        )}
      </div>
    </div>
  );
};

export default HomePage;