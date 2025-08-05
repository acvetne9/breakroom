import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo } from 'framer-motion';
import InitiationPage from './InitiationPage';
import HomePage from './HomePage';
import SettingsPage from './SettingsPage';
import ExplorePage from './ExplorePage';

import { useBusinessesData } from '../hooks/useBusinessesData';

interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
  timePeriod: string;
}

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  isJobUpdate?: boolean;
  linkedLocation?: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down' | null;
  createdAt: Date;
}

const MobileApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<'initiation' | 'main'>('initiation');
  const [currentSlide, setCurrentSlide] = useState(1); // 0: Settings, 1: Home, 2: Explore
  const [userData, setUserData] = useState<UserData | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{[postId: string]: string[]}>({});
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [previouslySelectedBusiness, setPreviouslySelectedBusiness] = useState<any>(null);
  const [filteredBusinessId, setFilteredBusinessId] = useState<string | null>(null);
  const [filteredUserStories, setFilteredUserStories] = useState(false);
  
  const constraintsRef = useRef(null);
  const { businesses, loading, setBusinesses, fetchFullBusinessDetails } = useBusinessesData();

  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      author: 'BaristaBoss',
      text: 'Guess what!! I never thought this would happen but my boss brought in donuts today!',
      isStory: false,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    },
    {
      id: '2',
      author: 'Cook52345234',
      text: 'My old manager would always refuse to approve my sick leave :(',
      isStory: false,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    }
  ]);

  const handleInitiationComplete = (data: UserData) => {
    console.log('MobileApp: handleInitiationComplete called with:', data);
    setUserData(data);
    console.log('MobileApp: Setting currentView to main and currentSlide to 1');
    setCurrentView('main');
    setCurrentSlide(1); // Ensure we land on the home view (slide 1) where map is visible
    
    // Create automatic job update post
    const jobUpdatePost: Post = {
      id: `job-update-${Date.now()}`,
      author: 'You',
      text: `New Job Update! ${data.salary}/${data.timePeriod || 'HR'} for ${data.role} 😳`,
      isJobUpdate: true,
      isStory: false,
      linkedLocation: data.fullLocation || data.location,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
      createdAt: new Date()
    };
    setPosts(prevPosts => [jobUpdatePost, ...prevPosts]);
  };

  const handleJobUpdate = (jobData: { salary: string; role: string; location: string; timePeriod: string }) => {
    const jobUpdatePost: Post = {
      id: `job-update-${Date.now()}`,
      author: 'You',
      text: `New Job Update! ${jobData.salary}/${jobData.timePeriod} for ${jobData.role} 😳`,
      isJobUpdate: true,
      isStory: false,
      linkedLocation: jobData.location,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
      createdAt: new Date()
    };
    setPosts(prevPosts => [jobUpdatePost, ...prevPosts]);
  };

  // NEW: Handle saving location when user clicks on a business
  const handleLocationSave = (location: string, fullLocation: string) => {
    console.log('Saving clicked business location:', { location, fullLocation });
    setUserData(prev => {
      if (prev) {
        return {
          ...prev,
          location: location,
          fullLocation: fullLocation
        };
      }
      return prev;
    });
  };

  const handlePostSubmit = (text: string, businessId?: string) => {
    const business = businessId ? businesses.find(b => b.id === businessId) : undefined;
    
    // Only create business stories when specifically viewing filtered posts for that business
    // Otherwise, create regular posts
    const shouldBeStory = filteredBusinessId && businessId === filteredBusinessId;
    
    const newPost: Post = {
      id: String(posts.length + 1),
      author: 'You',
      text,
      businessId: shouldBeStory ? businessId : undefined,
      businessName: shouldBeStory ? business?.name : undefined,
      isStory: shouldBeStory,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
      createdAt: new Date()
    };
    setPosts([newPost, ...posts]);
  };

  const handleBusinessClick = async (business: any) => {
    // Handle null business (close action)
    if (!business) {
      setSelectedBusiness(null);
      setFilteredBusinessId(null);
      return;
    }
    
    // Check if we need to fetch full details
    if (!business.atmosphere?.length && !business.roles?.length) {
      const fullBusiness = await fetchFullBusinessDetails(business.id);
      if (fullBusiness) {
        setSelectedBusiness(fullBusiness);
        // When selecting a business, we're not filtering posts by business
        setFilteredBusinessId(null);
        
        // Save the clicked business location
        if (fullBusiness.name) {
          handleLocationSave(fullBusiness.name, fullBusiness.name);
        }
      }
    } else {
      setSelectedBusiness(business);
      // When selecting a business, we're not filtering posts by business
      setFilteredBusinessId(null);
      
      // Save the clicked business location
      if (business.name) {
        handleLocationSave(business.name, business.name);
      }
    }
  };

  const handleBusinessStoriesClick = (businessId: string) => {
    setFilteredBusinessId(businessId);
    setCurrentSlide(2); // Navigate to explore page
  };

  const handleUserStoriesClick = () => {
    setFilteredUserStories(true);
    setCurrentSlide(2); // Navigate to explore page
  };

  const handleBackToAllPosts = () => {
    setFilteredBusinessId(null);
    setFilteredUserStories(false);
  };

  const handlePostVote = (postId: string, voteType: 'up' | 'down') => {
    setPosts(prevPosts => {
      const updatedPosts = prevPosts.map(post => {
        if (post.id === postId) {
          let newUpvotes = post.upvotes;
          let newDownvotes = post.downvotes;
          let newUserVote: 'up' | 'down' | null = post.userVote;

          if (voteType === 'up') {
            if (post.userVote === 'up') {
              // Remove upvote
              newUpvotes--;
              newUserVote = null;
            } else if (post.userVote === 'down') {
              // Switch from downvote to upvote
              newDownvotes--;
              newUpvotes++;
              newUserVote = 'up';
            } else {
              // Add upvote
              newUpvotes++;
              newUserVote = 'up';
            }
          } else {
            if (post.userVote === 'down') {
              // Remove downvote
              newDownvotes--;
              newUserVote = null;
            } else if (post.userVote === 'up') {
              // Switch from upvote to downvote
              newUpvotes--;
              newDownvotes++;
              newUserVote = 'down';
            } else {
              // Add downvote
              newDownvotes++;
              newUserVote = 'down';
            }
          }

          return {
            ...post,
            upvotes: newUpvotes,
            downvotes: newDownvotes,
            userVote: newUserVote
          };
        }
        return post;
      });

      // Auto-delete posts with score <= -3
      return updatedPosts.filter(post => (post.upvotes - post.downvotes) > -3);
    });
  };

  const handleRoleVote = (businessId: string, roleIndex: number, voteType: 'up' | 'down') => {
    setBusinesses(prevBusinesses => {
      const updatedBusinesses = prevBusinesses.map(business => {
        if (business.id === businessId && business.roles) {
          const updatedRoles = business.roles.map((role, index) => {
            if (index === roleIndex) {
              let newUpvotes = role.upvotes;
              let newDownvotes = role.downvotes;
              let newUserVote: 'up' | 'down' | null = role.userVote;

              if (voteType === 'up') {
                if (role.userVote === 'up') {
                  newUpvotes--;
                  newUserVote = null;
                } else if (role.userVote === 'down') {
                  newDownvotes--;
                  newUpvotes++;
                  newUserVote = 'up';
                } else {
                  newUpvotes++;
                  newUserVote = 'up';
                }
              } else {
                if (role.userVote === 'down') {
                  newDownvotes--;
                  newUserVote = null;
                } else if (role.userVote === 'up') {
                  newUpvotes--;
                  newDownvotes++;
                  newUserVote = 'down';
                } else {
                  newDownvotes++;
                  newUserVote = 'down';
                }
              }

              return {
                ...role,
                upvotes: newUpvotes,
                downvotes: newDownvotes,
                userVote: newUserVote
              };
            }
            return role;
          });

          // Auto-delete roles with score <= -3
          const filteredRoles = updatedRoles.filter(role => (role.upvotes - role.downvotes) > -3);

          return {
            ...business,
            roles: filteredRoles
          };
        }
        return business;
      });

      return updatedBusinesses;
    });
  };

  // Sync selectedBusiness when businesses data changes (for voting updates)
  useEffect(() => {
    if (selectedBusiness) {
      const updatedBusiness = businesses.find(b => b.id === selectedBusiness.id);
      if (updatedBusiness) {
        setSelectedBusiness(updatedBusiness);
      }
    }
  }, [businesses, selectedBusiness?.id]);

  // Handle business state when sliding to explore/settings and back
  useEffect(() => {
    if (currentSlide === 2 || currentSlide === 0) {
      // Going to explore or settings page - save current business and close it
      if (selectedBusiness) {
        setPreviouslySelectedBusiness(selectedBusiness);
        setSelectedBusiness(null);
      }
    } else if (currentSlide === 1 && previouslySelectedBusiness) {
      // Coming back to home page - restore previously selected business
      setSelectedBusiness(previouslySelectedBusiness);
      setPreviouslySelectedBusiness(null);
    }
    
    // Clear user stories filter when navigating away from explore
    if (currentSlide !== 2 && filteredUserStories) {
      setFilteredUserStories(false);
    }
  }, [currentSlide, selectedBusiness, previouslySelectedBusiness, filteredUserStories]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 100;
    const dragStartX = event.clientX || event.touches?.[0]?.clientX || 0;
    const screenWidth = window.innerWidth;
    const edgeThreshold = 50; // Only allow swiping within 50px of screen edges
    
    // Only allow swiping if drag started near screen edges
    const isNearLeftEdge = dragStartX < edgeThreshold;
    const isNearRightEdge = dragStartX > screenWidth - edgeThreshold;
    
    if ((isNearLeftEdge || isNearRightEdge)) {
      if (info.offset.x > threshold && currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
      } else if (info.offset.x < -threshold && currentSlide < 2) {
        setCurrentSlide(currentSlide + 1);
      }
    }
  };

  console.log('MobileApp: Rendering with currentView:', currentView);

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-100">
      {/* Map is always the background */}
      <HomePage 
        businesses={businesses} 
        currentSlide={currentSlide}
        currentView={currentView}
        selectedBusiness={selectedBusiness}
        onBusinessSelect={handleBusinessClick}
        posts={posts}
        onBusinessStoriesClick={handleBusinessStoriesClick}
        onPostClick={(post) => {
          setExpandedPost(post.id);
        }}
        onRoleVote={handleRoleVote}
        onLocationSave={handleLocationSave} // NEW: Pass the location save handler
      />
      
      {/* Initiation Card - slides up and disappears */}
      {currentView === 'initiation' && (
        <InitiationPage onComplete={handleInitiationComplete} />
      )}
      
      {/* Settings Card - slides from left */}
      {currentSlide === 0 && userData && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-10 bg-black/20 flex items-center justify-center"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x < -100) {
              setCurrentSlide(1);
            }
          }}
        >
          <div className="w-full max-w-sm mx-4">
            <SettingsPage 
              initialData={userData} 
              userPosts={posts.filter(post => post.author === 'You')}
              onStoriesClick={handleUserStoriesClick}
              onPostClick={(post) => {
                setExpandedPost(post.id);
                setCurrentSlide(2); // Navigate to explore page
              }}
              onJobUpdate={handleJobUpdate}
            />
          </div>
        </motion.div>
      )}

      {/* Explore Card - slides from right */}
      {currentSlide === 2 && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-10 bg-black/20 flex items-center justify-center"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x > 100) {
              setCurrentSlide(1);
            }
          }}
        >
          <div className="w-full max-w-sm mx-4">
            <ExplorePage 
              posts={posts}
              filteredBusinessId={filteredBusinessId || undefined}
              filteredUserStories={filteredUserStories}
              onBusinessView={(businessId) => {
                const business = businesses.find(b => b.id === businessId);
                if (business) {
                  setSelectedBusiness(business);
                  setCurrentSlide(1); // Navigate to home page
                }
              }}
              onExpandedPostChange={(postId) => {
                setExpandedPost(postId);
              }}
              onCommentSubmit={(postId, comment) => {
                setComments({
                  ...comments,
                  [postId]: [...(comments[postId] || []), comment]
                });
              }}
              onPostSubmit={handlePostSubmit}
              onBackToAllPosts={handleBackToAllPosts}
              onPostVote={handlePostVote}
            />
          </div>
        </motion.div>
      )}

      {/* Swipe detection overlay - only at screen edges */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
      >
        {/* Left edge swipe area */}
        <div 
          className="absolute left-0 top-0 w-12 h-full pointer-events-auto"
          onTouchStart={(e) => {
            if (currentSlide > 0) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                const moveTouch = moveEvent.touches[0];
                const deltaX = moveTouch.clientX - startX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide - 1);
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
              };
              document.addEventListener('touchmove', handleTouchMove);
              document.addEventListener('touchend', handleTouchEnd);
            }
          }}
        />
        
        {/* Right edge swipe area */}
        <div 
          className="absolute right-0 top-0 w-12 h-full pointer-events-auto"
          onTouchStart={(e) => {
             if (currentSlide < 2) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                const moveTouch = moveEvent.touches[0];
                const deltaX = startX - moveTouch.clientX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide + 1);
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
              };
              document.addEventListener('touchmove', handleTouchMove);
              document.addEventListener('touchend', handleTouchEnd);
            }
          }}
        />
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-50">
        {[0, 1, 2].map(index => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`w-3 h-3 rounded-full transition-colors ${
              index === currentSlide ? 'bg-app-yellow' : 'bg-app-gray-light'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default MobileApp;