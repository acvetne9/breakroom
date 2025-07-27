
import React, { memo } from 'react';
import { formatTimeAgo } from '../utils/timeAgo';

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

interface BusinessPreviewProps {
  business: {
    id: string;
    name: string;
    atmosphere: string[];
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
  };
  posts: Post[];
  onClose: () => void;
  onShowDetails: () => void;
  onStoriesClick: () => void;
}

const BusinessPreview: React.FC<BusinessPreviewProps> = memo(({ business, posts, onClose, onShowDetails, onStoriesClick }) => {
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
      className="fixed inset-0 z-30 flex items-start justify-center"
      style={{ paddingTop: '25vh' }}
      onClick={handleBackgroundClick}
    >
      {/* Yellow circle for selected pin */}
      <div className="absolute w-6 h-6 bg-app-yellow rounded-full opacity-50 animate-scale-in" 
           style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      
      <div 
        className="app-popup p-6 cursor-pointer relative animate-fade-in"
        onClick={handlePreviewClick}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-app-black">{business.name}</h3>
            <div className="flex items-center mt-1">
              <span className="text-app-gray-medium text-sm">
                {business.atmosphere.join(' • ')}
              </span>
            </div>
          </div>
        </div>

        {business.salary && (
          <div className="mb-4">
            <p className="text-app-black">
              <span className="font-medium">
                {business.salary}
                {!business.salary.includes('/') && (
                  <span className="text-xs text-app-gray-medium ml-1">/hr</span>
                )}
              </span> Barista
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
                  className="text-sm text-app-gray-dark cursor-pointer hover:text-app-black relative pb-4"
                  onClick={handleStoryClick}
                >
                  <p className="line-clamp-2">
                    {story.text.length > 60 ? `${story.text.substring(0, 60)}...` : story.text}
                  </p>
                  <span className="absolute bottom-0 left-0 text-xs text-gray-400">{formatTimeAgo(story.createdAt)}</span>
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
});

export default BusinessPreview;
