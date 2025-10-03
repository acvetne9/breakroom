import React, { useState, useRef, useEffect, Suspense } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import InitiationPage from './InitiationPage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const HomePage = React.lazy(() => import('./HomePage'));
const SettingsPage = React.lazy(() => import('./SettingsPage'));
const ExplorePage = React.lazy(() => import('./ExplorePage'));

import { useBusinessesData } from '../hooks/useBusinessesData';
import { handleRoleVote as handleRoleVoteService } from '@/services/roleVoting';
import { useProfileInit } from '@/hooks/useProfileInit';

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
  const { user } = useAuth();
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
  
  // Initialize profile immediately on app mount
  useProfileInit();

  // Check if current job exists and show initiation card if needed
  useEffect(() => {
    const checkInitiationStatus = async () => {
      try {
        // Check if they have a current job
        const { hasCurrentJob } = await import('../services/currentJobs');
        const hasJob = await hasCurrentJob();
        
        console.log('Has current job:', hasJob);
        
        if (hasJob) {
          setCurrentView('main');
        } else {
          // No job - show initiation card
          setCurrentView('initiation');
        }
      } catch (error) {
        console.error('Error checking initiation status:', error);
        // On error, show main view to avoid blocking user
        setCurrentView('main');
      }
    };

    // Small delay to ensure profile init completes first
    setTimeout(checkInitiationStatus, 100);
  }, []);

  // Remove local posts state - now handled by backend

  const handleInitiationComplete = async (data: UserData) => {
    setUserData(data);
    setCurrentView('main');
    
    // Save job data to database
    try {
      // Save current job
      const { saveCurrentJob } = await import('../services/currentJobs');
      const salary = parseInt(data.salary.replace(/[^0-9]/g, '')) || 0;
      await saveCurrentJob({
        role: data.role,
        salary: salary,
        location: data.location,
        time_period: data.timePeriod || 'HR'
      });
      
      // Save business role
      const { createOrUpdateBusinessRole } = await import('../services/businesses');
      await createOrUpdateBusinessRole(data.location, data.role, data.salary);
      console.log('Job saved to database:', { location: data.location, role: data.role, salary: data.salary });
      
      // Create job update post
      const { createPost } = await import('../services/posts');
      await createPost(
        `New Job Update! ${data.salary}/${data.timePeriod || 'HR'} for ${data.role} 😳`,
        'job_update',
        undefined,
        data.role,
        data.timePeriod,
        salary
      );
    } catch (error) {
      console.error('Error saving job data:', error);
      // Continue to main view even if save fails
    }
  };

  const handleJobUpdate = async (jobData: { salary: string; role: string; location: string; timePeriod: string }) => {
    // Save job data to database
    try {
      const { createOrUpdateBusinessRole } = await import('../services/businesses');
      await createOrUpdateBusinessRole(jobData.location, jobData.role, jobData.salary);
      console.log('Job role updated in database:', jobData);
      
      // Create job update post in backend
      const { createPost } = await import('../services/posts');
      const salary = parseInt(jobData.salary.replace(/[^0-9]/g, '')) || 0;
      await createPost(
        `New Job Update! ${jobData.salary}/${jobData.timePeriod} for ${jobData.role} 😳`,
        'job_update',
        undefined,
        jobData.role,
        jobData.timePeriod,
        salary
      );
    } catch (error) {
      console.error('Error updating job role in database:', error);
    }
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

  // Remove handlePostSubmit - now handled by ExplorePage directly

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

  // Remove handlePostVote and handlePostDelete - now handled by ExplorePage directly

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
          onBusinessStoriesClick={handleBusinessStoriesClick}
          onPostClick={(post) => {
            setExpandedPost(post.id);
          }}
          onRoleVote={handleRoleVote}
          onLocationSave={handleLocationSave}
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
              filteredBusinessId={filteredBusinessId || undefined}
              filteredUserStories={filteredUserStories}
              onBusinessView={(businessId) => {
                const business = businesses.find(b => b.id === businessId);
                if (business) {
                  setSelectedBusiness(business);  // ✅ MapLibreMap will auto-fly
                  setCurrentSlide(1);
                } else {
                  (async () => {
                    const full = await fetchFullBusinessDetails(businessId);
                    if (full) {
                      setSelectedBusiness(full);
                      setCurrentSlide(1);
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
              onBackToAllPosts={handleBackToAllPosts}
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
            // Prevent swipe if multi-touch (zoom gesture)
            if (currentSlide > 0 && e.touches.length === 1) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                // Check if still single touch
                if (moveEvent.touches.length !== 1) {
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                  return;
                }
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
             // Prevent swipe if multi-touch (zoom gesture)
             if (currentSlide < 2 && e.touches.length === 1) {
              const touch = e.touches[0];
              const startX = touch.clientX;
              const handleTouchMove = (moveEvent: TouchEvent) => {
                // Check if still single touch
                if (moveEvent.touches.length !== 1) {
                  document.removeEventListener('touchmove', handleTouchMove);
                  document.removeEventListener('touchend', handleTouchEnd);
                  return;
                }
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