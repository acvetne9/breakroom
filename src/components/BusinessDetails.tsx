
import React from 'react';
import { Compass } from 'lucide-react';
interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
}

interface BusinessDetailsProps {
  business: {
    id: string;
    name: string;
    rating: number;
    salary?: string;
    stories?: Array<{
      id: string;
      text: string;
      author: string;
    }>;
    roles?: Array<{
      role: string;
      salary: string;
    }>;
    website?: string;
    url?: string;
  };
  posts: Post[];
  onClose: () => void;
  onStoriesClick?: () => void;
}
const BusinessDetails: React.FC<BusinessDetailsProps> = ({
  business,
  posts,
  onClose,
  onStoriesClick
}) => {
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  const handleCompassClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Try business website first, then Google Maps page, then fallback to Google search
    const destination = business.website || 
                       business.url || 
                       `https://www.google.com/search?q=${encodeURIComponent(business.name)}`;
    
    window.open(destination, '_blank');
  };
  // Get stories (posts) for this business
  const businessStories = posts.filter(post => post.businessId === business.id && post.isStory);

  const handleCardClick = (e: React.MouseEvent) => {
    // Check if click is on stories or compass - if so, don't close
    const target = e.target as HTMLElement;
    const isStoryClick = target.closest('.story-item');
    const isCompassClick = target.closest('.compass-button');
    if (!isStoryClick && !isCompassClick) {
      onClose();
    }
  };

  const handleStoryClick = () => {
    onStoriesClick?.();
  };
  return <div className="fixed inset-0 z-40 flex items-start justify-center pt-16" onClick={handleBackgroundClick}>
      <div className="app-card p-6 overflow-y-auto animate-fade-in" onClick={handleCardClick}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-medium text-app-black">{business.name}</h2>
            <div className="flex items-center mt-2">
              <div className="flex items-center">
                <span className="text-app-gray-medium">
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
                <span className="text-app-gray-medium ml-2">
                  {(business.rating || 0).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
          <button onClick={handleCompassClick} className="compass-button p-2 rounded-lg bg-gray-100/0 py-0">
            <span className="text-3xl">🧭</span>{/* <Compass className="w-6 h-6 text-app-gray-dark" /> */}
          </button>
        </div>

        {/* Job roles and salaries */}
        <div className="mb-8">
          <h3 className="text-lg font-medium text-app-black mb-4">Roles & Salaries</h3>
          <div className="space-y-3">
            {business.roles ? business.roles.map((role, index) => <div key={index} className="flex justify-between items-center">
                <span className="text-app-black">{role.role}</span>
                <span className="font-medium text-app-black">{role.salary}</span>
              </div>) : <div className="flex justify-between items-center">
                <span className="text-app-black">Barista</span>
                <span className="font-medium text-app-black">{business.salary || '$13.6'}</span>
              </div>}
          </div>
        </div>

        {/* Stories section */}
        {businessStories.length > 0 && <div>
            <h3 className="text-lg font-medium text-app-black mb-4">More Stories 📖</h3>
            <div className="space-y-4">
              {businessStories.map(story => <div key={story.id} className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded" onClick={handleStoryClick}>
                  <p className="text-app-gray-dark text-sm">
                    <span className="font-medium">@{story.author}:</span> {story.text.length > 100 ? `${story.text.substring(0, 100)}...` : story.text}
                  </p>
                </div>)}
            </div>
          </div>}
      </div>
    </div>;
};
export default BusinessDetails;
