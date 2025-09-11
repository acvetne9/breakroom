import React, { useState, useRef, useEffect, Suspense } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import InitiationPage from './InitiationPage';

const HomePage = React.lazy(() => import('./HomePage'));
const SettingsPage = React.lazy(() => import('./SettingsPage'));
const ExplorePage = React.lazy(() => import('./ExplorePage'));

import { useBusinessesData } from '../hooks/useBusinessesData';
import { handleRoleVote as handleRoleVoteService } from '@/services/roleVoting';

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
  const isMobile = useIsMobile();
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

  const handleInitiationComplete = async (data: UserData) => {
    setUserData(data);
    setCurrentView('main');
    
    // Save job data to database (only if authenticated)
    try {
      const { createOrUpdateBusinessRole } = await import('../services/businesses');
      await createOrUpdateBusinessRole(data.location, data.role, data.salary);
      console.log('Job role saved to database:', { location: data.location, role: data.role, salary: data.salary });
    } catch (error) {
      console.warn('Could not save job role to database (user not authenticated):', error);
      // Continue without showing error to user since this is optional functionality
    }
    
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

  const handleJobUpdate = async (jobData: { salary: string; role: string; location: string; timePeriod: string }) => {
    // Save job data to database
    try {
      const { createOrUpdateBusinessRole } = await import('../services/businesses');
      await createOrUpdateBusinessRole(jobData.location, jobData.role, jobData.salary);
      console.log('Job role updated in database:', jobData);
    } catch (error) {
      console.error('Error updating job role in database:', error);
    }
    
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

  const handlePostDelete = (postId: string) => {
    setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
  };

  const handleRoleVote = async (businessId: string, roleIndex: number, voteType: 'up' | 'down') => {
    // Find the role ID from the business
    let business = businesses.find(b => b.id === businessId);
    
    // If business doesn't have role IDs, fetch full details first
    if (!business?.roles?.[roleIndex]?.id) {
      console.log('🔄 Role missing ID, fetching full business details...');
      const fullBusiness = await fetchFullBusinessDetails(businessId);
      if (fullBusiness?.roles?.[roleIndex]?.id) {
        // Update the businesses array with full details
        setBusinesses(prev => prev.map(b => b.id === businessId ? fullBusiness : b));
        business = fullBusiness;
      } else {
        console.error('Role not found for voting after fetching full details');
        return;
      }
    }

    const roleId = business.roles[roleIndex].id;

    // Optimistically update UI first
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

          return {
            ...business,
            roles: updatedRoles
          };
        }
        return business;
      });
      return updatedBusinesses;
    });

    // Then persist to database
    const result = await handleRoleVoteService(businessId, roleId, voteType);
    
    if (!result.success) {
      console.error('Failed to persist vote:', result.error);
      // Revert optimistic update on error
      setBusinesses(prevBusinesses => {
        const updatedBusinesses = prevBusinesses.map(business => {
          if (business.id === businessId && business.roles) {
            const updatedRoles = business.roles.map((role, index) => {
              if (index === roleIndex) {
                let revertUpvotes = role.upvotes;
                let revertDownvotes = role.downvotes;
                let revertUserVote: 'up' | 'down' | null = role.userVote;

                // Revert the optimistic update
                if (voteType === 'up') {
                  if (role.userVote === null) {
                    revertUpvotes--;
                    revertUserVote = 'up';
                  } else if (role.userVote === 'up') {
                    revertDownvotes++;
                    revertUpvotes--;
                    revertUserVote = 'down';
                  } else {
                    revertUserVote = null;
                  }
                } else {
                  if (role.userVote === null) {
                    revertDownvotes--;
                    revertUserVote = 'down';  
                  } else if (role.userVote === 'down') {
                    revertUpvotes++;
                    revertDownvotes--;
                    revertUserVote = 'up';
                  } else {
                    revertUserVote = null;
                  }
                }

                return {
                  ...role,
                  upvotes: revertUpvotes,
                  downvotes: revertDownvotes,
                  userVote: revertUserVote
                };
              }
              return role;
            });

            return {
              ...business,
              roles: updatedRoles
            };
          }
          return business;
        });
        return updatedBusinesses;
      });
    }
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

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map is always the background */}
      <Suspense fallback={<Skeleton className="w-full h-full" />}>
        <HomePage 
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
      </Suspense>
      
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
          className="absolute inset-0 z-20"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x < -100) {
              setCurrentSlide(1);
            }
          }}
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <SettingsPage 
              initialData={userData} 
              userPosts={posts.filter(post => post.author === 'You')}
              onStoriesClick={handleUserStoriesClick}
              onPostClick={(post) => {
                setExpandedPost(post.id);
                setCurrentSlide(2); // Navigate to explore page
              }}
              onJobUpdate={handleJobUpdate}
              onSearchTrigger={(searchTerm) => {
                // Navigate to home page and trigger search
                setCurrentSlide(1);
                // Set search state that will be picked up by HomePage
                setTimeout(() => {
                  const searchEvent = new CustomEvent('triggerSearch', { detail: searchTerm });
                  window.dispatchEvent(searchEvent);
                }, 100);
              }}
            />
          </Suspense>
        </motion.div>
      )}

      {/* Explore Card - slides from right */}
      {currentSlide === 2 && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x > 100) {
              setCurrentSlide(1);
            }
          }}
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <ExplorePage 
              posts={posts}
              filteredBusinessId={filteredBusinessId || undefined}
              filteredUserStories={filteredUserStories}
              onBusinessView={(businessId) => {
                console.log('👁️ Business view requested:', businessId);
                const business = businesses.find(b => b.id === businessId);
                console.log('📍 Found business:', business?.name);
                if (business) {
                  console.log('🏠 Setting selected business and navigating to home');
                  setSelectedBusiness(business);
                  setCurrentSlide(1); // Navigate to home page
                } else {
                  console.warn('❌ Business not found in businesses array, fetching details...');
                  (async () => {
                    try {
                      const full = await fetchFullBusinessDetails(businessId);
                      if (full) {
                        console.log('✅ Loaded business details, navigating to home');
                        setSelectedBusiness(full);
                        setCurrentSlide(1);
                      } else {
                        console.warn('❌ Could not load business details for id:', businessId);
                      }
                    } catch (err) {
                      console.error('❌ Error fetching business details:', err);
                    }
                  })();
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
              onPostDelete={handlePostDelete}
            />
          </Suspense>
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

      {/* Slide indicators - only show on desktop */}
      {!isMobile && (
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
      )}
    </div>
  );
};

export default MobileApp;