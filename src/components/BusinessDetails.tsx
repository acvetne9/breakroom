import React from 'react';
import { Compass } from 'lucide-react';

interface BusinessDetailsProps {
  business: {
    id: string;
    name: string;
    rating: number;
    salary?: string;
    stories?: Array<{ id: string; text: string; author: string }>;
    roles?: Array<{ role: string; salary: string }>;
  };
  onClose: () => void;
}

const BusinessDetails: React.FC<BusinessDetailsProps> = ({ business, onClose }) => {
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCompassClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Link to external business jobs page
    window.open(`https://example.com/jobs/${business.id}`, '_blank');
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Check if click is on stories or compass - if so, don't close
    const target = e.target as HTMLElement;
    const isStoryClick = target.closest('.story-item');
    const isCompassClick = target.closest('.compass-button');
    
    if (!isStoryClick && !isCompassClick) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-40 flex items-start justify-center pt-16"
      onClick={handleBackgroundClick}
    >
      <div className="app-card p-6 overflow-y-auto animate-fade-in" onClick={handleCardClick}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-medium text-app-black">{business.name}</h2>
            <div className="flex items-center mt-2">
              <span className="text-app-gray-medium">
                {'★'.repeat(Math.floor(business.rating))} {business.rating}
              </span>
            </div>
          </div>
          <button 
            onClick={handleCompassClick}
            className="compass-button p-2 hover:bg-gray-100 rounded-lg"
          >
            <Compass className="w-6 h-6 text-app-gray-dark" />
          </button>
        </div>

        {/* Job roles and salaries */}
        <div className="mb-8">
          <h3 className="text-lg font-medium text-app-black mb-4">Roles & Salaries</h3>
          <div className="space-y-3">
            {business.roles ? business.roles.map((role, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-app-black">{role.role}</span>
                <span className="font-medium text-app-black">{role.salary}</span>
              </div>
            )) : (
              <div className="flex justify-between items-center">
                <span className="text-app-black">Barista</span>
                <span className="font-medium text-app-black">{business.salary || '$13.6'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stories section */}
        {business.stories && business.stories.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-app-black mb-4">More Stories</h3>
            <div className="space-y-4">
              {business.stories.map(story => (
                <div key={story.id} className="story-item border-l-2 border-app-gray-light pl-4">
                  <p className="text-app-gray-dark text-sm">
                    {story.text.length > 120 ? `${story.text.substring(0, 120)}...` : story.text}
                  </p>
                  <p className="text-app-gray-medium text-xs mt-1">— {story.author}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessDetails;