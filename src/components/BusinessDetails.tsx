
import React from 'react';
import { Compass } from 'lucide-react';
import VotingComponent from './VotingComponent';
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
    atmosphere: string[];
    salary?: string;
    stories?: Array<{
      id: string;
      text: string;
      author: string;
    }>;
    roles?: Array<{
      role: string;
      salary: string;
      upvotes?: number;
      downvotes?: number;
      userVote?: 'up' | 'down' | null;
    }>;
    website?: string;
    url?: string;
  };
  posts: Post[];
  onClose: () => void;
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onRoleVote?: (businessId: string, roleIndex: number, voteType: 'up' | 'down') => void;
}
const BusinessDetails: React.FC<BusinessDetailsProps> = ({
  business,
  posts,
  onClose,
  onStoriesClick,
  onPostClick,
  onRoleVote
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
    // Check if click is on stories, compass, or voting - if so, don't close
    const target = e.target as HTMLElement;
    const isStoryClick = target.closest('.story-item');
    const isCompassClick = target.closest('.compass-button');
    const isVotingClick = target.closest('[data-voting-component]');
    if (!isStoryClick && !isCompassClick && !isVotingClick) {
      onClose();
    }
  };

  const handleStoryClick = (post: Post) => {
    onPostClick?.(post);
  };

  const handleRoleVote = (roleIndex: number, voteType: 'up' | 'down') => {
    onRoleVote?.(business.id, roleIndex, voteType);
  };
  return <div className="fixed inset-0 z-40 flex items-start justify-center" style={{ paddingTop: '8vh' }} onClick={handleBackgroundClick}>
      <div className="app-card p-6 overflow-y-auto animate-fade-in" onClick={handleCardClick}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-medium text-app-black">{business.name}</h2>
            <div className="flex items-center mt-2">
              <span className="text-app-gray-medium">
                {business.atmosphere.join(' • ')}
              </span>
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
                <div className="flex items-center space-x-3">
                  <span className="font-medium text-app-black">
                    {role.salary}
                    {!role.salary.includes('/') && (
                      <span className="text-xs text-app-gray-medium ml-1">/hr</span>
                    )}
                  </span>
                  <VotingComponent
                    upvotes={role.upvotes || 0}
                    downvotes={role.downvotes || 0}
                    userVote={role.userVote}
                    onVote={(voteType) => handleRoleVote(index, voteType)}
                  />
                </div>
              </div>) : <div className="flex justify-between items-center">
                <span className="text-app-black">Barista</span>
                <div className="flex items-center space-x-3">
                  <span className="font-medium text-app-black">{business.salary || '$13.6'}</span>
                  <VotingComponent
                    upvotes={0}
                    downvotes={0}
                    userVote={null}
                    onVote={() => {}}
                  />
                </div>
              </div>}
          </div>
          <div className="flex justify-end mt-3">
            <span className="text-xs text-app-gray-medium">Do these seem right?</span>
          </div>
        </div>

        {/* Stories section */}
        <div>
          <h3 className="text-lg font-medium text-app-black mb-4">More Stories 📖</h3>
          <div className="space-y-4">
            {businessStories.length > 0 ? (
              <>
                {businessStories.slice(0, 5).map(story => (
                  <div key={story.id} className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded" onClick={() => handleStoryClick(story)}>
                    <p className="text-app-gray-dark text-sm">
                      {story.text.length > 100 ? `${story.text.substring(0, 100)}...` : story.text}
                    </p>
                  </div>
                ))}
                {businessStories.length > 5 && (
                  <button 
                    onClick={onStoriesClick} 
                    className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                  >
                    View all Stories ({businessStories.length})
                  </button>
                )}
              </>
            ) : (
              <div className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded" onClick={() => onStoriesClick?.()}>
                <p className="text-app-gray-dark text-sm font-medium">
                  Be the first to post! 🚀
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>;
};
export default BusinessDetails;
