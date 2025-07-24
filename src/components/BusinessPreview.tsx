
import React from 'react';
import { Eye } from 'lucide-react';

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
}

interface BusinessPreviewProps {
  business: {
    id: string;
    name: string;
    rating: number;
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
  };
  posts: Post[];
  onClose: () => void;
  onShowDetails: () => void;
  onStoriesClick: () => void;
}

const BusinessPreview: React.FC<BusinessPreviewProps> = ({ business, posts, onClose, onShowDetails, onStoriesClick }) => {
  // Get stories (posts) for this business
  const businessStories = posts.filter(post => post.businessId === business.id && post.isStory).slice(0, 3);

  const handleStoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // This will trigger navigation to explore page with filtered posts
    onStoriesClick();
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (!e.defaultPrevented) {
      onShowDetails();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-30 flex items-start justify-center pt-20"
      onClick={handleBackgroundClick}
    >
      {/* Yellow circle for selected pin */}
      <div className="absolute w-6 h-6 bg-app-yellow rounded-full opacity-50 animate-scale-in" 
           style={{ top: '35%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      
      <div 
        className="app-popup p-6 cursor-pointer relative animate-fade-in"
        onClick={handlePreviewClick}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-app-black">{business.name}</h3>
            <div className="flex items-center mt-1">
              <div className="flex items-center">
                <span className="text-app-gray-medium text-sm">
                  {Array.from({ length: 5 }, (_, i) => {
                    const starValue = i + 1;
                    const rating = business.rating || 0;
                    if (rating >= starValue) {
                      return '★';
                    } else if (rating >= starValue - 0.5) {
                      return '☆';
                    } else {
                      return '☆';
                    }
                  }).join('')}
                </span>
                <span className="text-app-gray-medium text-sm ml-2">
                  {(business.rating || 0).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {business.salary && (
          <div className="mb-4">
            <p className="text-app-black">
              <span className="font-medium">{business.salary}</span> Barista
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-app-black">Stories 📖</h4>
          </div>
          <div className="space-y-2">
            {businessStories.length > 0 ? (
              businessStories.map(story => (
                <div 
                  key={story.id}
                  className="text-sm text-app-gray-dark cursor-pointer hover:text-app-black"
                  onClick={handleStoryClick}
                >
                  <p className="line-clamp-2">
                    <span className="font-medium">@{story.author}:</span> {story.text.length > 60 ? `${story.text.substring(0, 60)}...` : story.text}
                  </p>
                </div>
              ))
            ) : (
              <div 
                className="text-sm text-app-gray-medium cursor-pointer hover:text-app-black font-medium"
                onClick={handleStoryClick}
              >
                <p>Be the first to post! 🚀</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessPreview;
