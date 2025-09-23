import React, { memo } from 'react';
import { Compass } from 'lucide-react';
import VotingComponent from './VotingComponent';
import { formatTimeAgo } from '../utils/timeAgo';
import { TranslatedText } from './TranslatedText';

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

interface BusinessDetailsProps {
  business: {
    id: string;
    name: string;
    atmosphere: string[];
    salary?: string;
    address?: string;
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
  onBackToPreview?: () => void;
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onRoleVote?: (businessId: string, roleIndex: number, voteType: 'up' | 'down') => void;
}

const BusinessDetails: React.FC<BusinessDetailsProps> = memo(({
  business,
  posts,
  onClose,
  onBackToPreview,
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

    const destination = business.website ||
                       business.url ||
                       `https://www.google.com/search?q=${encodeURIComponent(business.name)}`;

    if (destination.includes("google.com/search")) {
      window.location.href = destination;
    } else {
      window.open(destination, "_blank");
    }
  };

  // Handle help button click with scroll to bottom
  const handleHelpButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHelpPopup(!showHelpPopup);
    
    // Scroll to bottom after a short delay to allow popup to render
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  const businessStories = Array.isArray(posts) ? posts.filter(post => post.businessId === business.id && post.isStory) : [];

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBackToPreview?.();
  };

  const handleStoryClick = (post: Post, e: React.MouseEvent) => {
    e.stopPropagation();
    onPostClick?.(post);
  };

  const handleRoleVote = (roleIndex: number, voteType: 'up' | 'down', e?: React.MouseEvent) => {
    e?.stopPropagation();
    onRoleVote?.(business.id, roleIndex, voteType);
  };

  const roles = Array.isArray(business.roles) ? business.roles : [];
  const shouldScroll = roles.length > 6;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center"
      style={{ paddingTop: '8vh' }}
      onClick={handleBackgroundClick}
    >
      <div className="app-card p-6 overflow-y-auto animate-fade-in" onClick={handleCardClick}>
        
        {/* Name + Address + Atmosphere */}
        <div className="flex justify-between items-start mb-4"> {/* was mb-6 */}
          <div>
            <TranslatedText 
              text={business.name}
              className="text-xl font-medium text-app-black"
            />

            {(
              business.address?.trim() || (Array.isArray(business.atmosphere) && business.atmosphere.length > 0)
            ) && (
              <div className="mt-1 flex flex-col gap-0.5">
                {business.address && (
                  <span className="text-sm text-app-gray-medium">
                    {business.address}
                  </span>
                )}
                {Array.isArray(business.atmosphere) && business.atmosphere.length > 0 && (
                  <span className="text-sm text-app-gray-medium">
                    {business.atmosphere.join(' • ')}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleCompassClick}
            className="compass-button p-2 rounded-lg bg-gray-100/0 py-0"
          >
            <span className="text-3xl">🧭</span>
          </button>
        </div>

        {/* Job roles and salaries */}
        <div className="mb-2"> {/* was mb-8 */}
          <h3 className="text-lg font-medium text-app-black mb-2"> {/* was mb-4 */}
            Roles & Salaries
          </h3>
          <div 
            className={`space-y-2 ${shouldScroll ? 'max-h-64 overflow-y-auto pr-2' : ''}`}
            style={shouldScroll ? { scrollbarWidth: 'thin' } : {}}
          >
            {business.roles ? business.roles.map((role, index) => (
              <div key={index} className="flex justify-between items-center py-1">
                <span className="text-app-black">{role.role}</span>
                <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                  <span className="font-medium text-app-black">
                    {typeof role.salary === 'string' ? role.salary : (business.salary || '$13.6')}
                    {!(typeof role.salary === 'string' && role.salary.includes('/')) && (
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
              </div>
            )) : (
              <div className="flex justify-between items-center py-1">
                <span className="text-app-black">Barista</span>
                <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                  <span className="font-medium text-app-black">{business.salary || '$13.6'}</span>
                  <VotingComponent
                    upvotes={0}
                    downvotes={0}
                    userVote={null}
                    onVote={() => {}}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-2"> {/* was mt-3 */}
            <span className="text-xs text-app-gray-medium">Do these seem right?</span>
          </div>
        </div>

        {/* Stories section */}
        <div>
          <h3 className="text-lg font-medium text-app-black mb-3"> {/* was mb-4 */}
            More Stories 📖
          </h3>
          <div className="space-y-4">
            {Array.isArray(businessStories) && businessStories.length > 0 ? (
              <>
                {businessStories.slice(0, 5).map(story => (
                  <div
                    key={story.id}
                    className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded relative"
                    onClick={(e) => handleStoryClick(story, e)}
                  >
                    <TranslatedText 
                      text={(story.text && story.text.length > 100) ? `${story.text.substring(0, 100)}...` : (story.text || '')}
                      className="text-app-gray-dark text-sm pb-4"
                    />
                    <span className="absolute bottom-2 left-4 text-xs text-gray-400">
                      {formatTimeAgo(story.createdAt)}
                    </span>
                  </div>
                ))}
                {Array.isArray(businessStories) && businessStories.length > 5 && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onStoriesClick?.();
                    }} 
                    className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                  >
                    View all Stories ({businessStories.length})
                  </button>
                )}
              </>
            ) : (
              <div
                className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  onStoriesClick?.();
                }}
              >
                <p className="text-app-gray-dark text-sm font-medium">
                  Be the first to post! 🚀
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Help Button - At the bottom left of scrollable content */}
        <div className="mt-8 flex justify-start relative">
          <button 
            onClick={handleHelpButtonClick}
            className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
          >
            ?
          </button>
        </div>

        {/* Help Popup - Styled like other cards with rounded edges */}
        {showHelpPopup && (
          <div 
            className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-app-gray-dark">
              <strong>Disclaimer:</strong> The information presented in this app is based on surveys, user input, and publicly available sources. We do not independently verify all information, and it should not be taken as factual statements about any individual or organization.
            </p>
          </div>
        )}

      </div>
    </div>
  );
});

export default BusinessDetails;
