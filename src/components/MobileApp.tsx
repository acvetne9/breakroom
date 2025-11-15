import React, { useState, useRef, useEffect, Suspense } from "react";
import { motion, PanInfo } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import InitiationPage from "./InitiationPage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDevice } from "@/contexts/DeviceContext";

const HomePage = React.lazy(() => import("./HomePage"));
const SettingsPage = React.lazy(() => import("./SettingsPage"));
const ExplorePage = React.lazy(() => import("./ExplorePage"));

import { useBusinessesData } from "../hooks/useBusinessesData";
import { Business } from "@/types/business";
import { usePostsContext } from "./PostsProvider";

interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
  businessName?: string;
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
  votesTotal: number;
  userVote?: "up" | "down" | null;
  createdAt: Date;
}

const MobileApp: React.FC = () => {
  console.log("🚀 MobileApp component rendering");
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<"initiation" | "main" | "loading">("loading");
  const [currentSlide, setCurrentSlide] = useState(1); // 0: Settings, 1: Home, 2: Explore
  const [userData, setUserData] = useState<UserData | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [postId: string]: string[] }>({});
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [previouslySelectedBusiness, setPreviouslySelectedBusiness] = useState<any>(null);
  const [filteredBusinessId, setFilteredBusinessId] = useState<string | null>(null);
  const [filteredUserStories, setFilteredUserStories] = useState(false);
  const [votingRoles, setVotingRoles] = useState<Set<string>>(new Set());

  const constraintsRef = useRef(null);
  const { businesses, loading, setBusinesses, fetchFullBusinessDetails } = useBusinessesData();
  const { posts } = usePostsContext();

  // Ref to prevent double initialization in React 18 StrictMode
  const hasInitialized = useRef(false);

  const { isFirstSession, loading: deviceLoading } = useDevice();

  useEffect(() => {
    if (hasInitialized.current) {
      console.log("Skipping duplicate initialization (StrictMode)");
      return;
    }

    if (deviceLoading) {
      console.log("Waiting for device initialization...");
      return;
    }

    hasInitialized.current = true;
    console.log("MobileApp initialization starting");

    const initializeApp = async () => {
      try {
        console.log("Debug - isFirstSession:", isFirstSession);

        const { hasCurrentJob, getCurrentJob } = await import("../services/currentJobs");
        const hasJob = await hasCurrentJob();

        console.log("Current job check:", hasJob);

        if (hasJob) {
          const currentJob = await getCurrentJob();
          if (currentJob) {
            setUserData({
              salary: `$${currentJob.salary.toFixed(2)}`,
              role: currentJob.role,
              location: currentJob.location,
              fullLocation: currentJob.location,
              businessName: currentJob.business_name || '',
              timePeriod: currentJob.time_period || "HR",
            });
            console.log("Loaded user data:", currentJob);
          }
          console.log("Job found - going to main view");
          setCurrentView("main");
        } else if (isFirstSession) {
          console.log("First session, no job - going to main view");
          setCurrentView("main");
        } else {
          console.log("Not first session, no job - showing initiation page");
          setCurrentView("initiation");
        }
      } catch (error) {
        console.error("Error during app initialization:", error);
        setCurrentView("main");
      }
    };

    initializeApp();
  }, [isFirstSession, deviceLoading]);

  // Re-check current job when returning to home page
  useEffect(() => {
    if (currentSlide === 1 && currentView === "initiation") {
      const recheckCurrentJob = async () => {
        try {
          const { hasCurrentJob, getCurrentJob } = await import("../services/currentJobs");
          const hasJob = await hasCurrentJob();
          
          if (hasJob) {
            const currentJob = await getCurrentJob();
            if (currentJob) {
              setUserData({
                salary: `$${currentJob.salary.toFixed(2)}`,
                role: currentJob.role,
                location: currentJob.location,
                fullLocation: currentJob.location,
                businessName: currentJob.business_name || '',
                timePeriod: currentJob.time_period || "HR",
              });
              setCurrentView("main");
              console.log("Re-checked job on home page return - found job, switching to main view");
            }
          }
        } catch (error) {
          console.error("Error re-checking current job:", error);
        }
      };
      
      recheckCurrentJob();
    }
  }, [currentSlide, currentView]);

  const handleInitiationComplete = async (data: UserData) => {
    console.log('🎯 handleInitiationComplete called with:', data);
    setUserData(data);
    setCurrentView("main");

    try {
      const { saveCurrentJob } = await import("../services/currentJobs");
      const { toast } = await import("@/hooks/use-toast");
      const salary = parseFloat(data.salary.replace(/[^0-9.]/g, "")) || 0;
      
      console.log('💾 Attempting to save current job...');
      
      // STEP 1: Always save current job to database
      await saveCurrentJob({
        role: data.role,
        salary: salary,
        location: data.location,
        business_name: data.businessName || '',
        time_period: data.timePeriod || "HR",
      });
      console.log("✅ Current job saved to database successfully");
      
      toast({
        title: "Job saved!",
        description: "Your current job has been saved successfully.",
      });

      let businessId: string | undefined;

      // STEP 2: Check if business exists (don't create if missing)
      try {
        const { data: existingBusiness } = await supabase
          .from('businesses')
          .select('id')
          .ilike('name', data.location)
          .maybeSingle();

        if (existingBusiness) {
          businessId = existingBusiness.id;
          
          // STEP 3: Create business role only if business exists
          const { createOrUpdateBusinessRole } = await import("../services/businesses");
          await createOrUpdateBusinessRole(data.location, data.role, data.salary);
          console.log("✅ Business role created");
        } else {
          console.log("ℹ️ Business not in database, skipping role creation");
        }
      } catch (roleError) {
        console.error("Error with business role:", roleError);
      }

      // STEP 4: Always create post
      const { createPost } = await import("../services/posts");
      await createPost(
        `New Job Update! ${data.salary}/${data.timePeriod || "HR"} for ${data.role} 😳`,
        "job_update",
        businessId,
        data.role,
        data.timePeriod,
        salary,
      );
      console.log("✅ Post created");
      
    } catch (error) {
      console.error("❌ Error saving job data:", error);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        variant: "destructive",
        title: "Failed to save job",
        description: error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  const handleJobUpdate = async (jobData: { salary: string; role: string; location: string; businessName?: string; timePeriod: string }) => {
    console.log('🎯 handleJobUpdate called with:', jobData);
    try {
      const { saveCurrentJob } = await import("../services/currentJobs");
      const { toast } = await import("@/hooks/use-toast");
      const salary = parseFloat(jobData.salary.replace(/[^0-9.]/g, "")) || 0;
      
      console.log('💾 Attempting to update current job...');
      
      // STEP 1: Always save current job
      await saveCurrentJob({
        role: jobData.role,
        salary: salary,
        location: jobData.location,
        business_name: jobData.businessName || jobData.location,
        time_period: jobData.timePeriod,
      });
      console.log("✅ Current job updated in database successfully");
      
      toast({
        title: "Job updated!",
        description: "Your current job has been updated successfully.",
      });

      // Update userData state to reflect changes
      setUserData(prev => prev ? {
        ...prev,
        salary: jobData.salary,
        role: jobData.role,
        location: jobData.location,
        businessName: jobData.businessName || jobData.location,
        timePeriod: jobData.timePeriod,
      } : null);
      console.log("✅ userData state updated");

      let businessId: string | undefined;

      // STEP 2: Check if business exists
      try {
        const { data: existingBusiness } = await supabase
          .from('businesses')
          .select('id')
          .ilike('name', jobData.location)
          .maybeSingle();

        if (existingBusiness) {
          businessId = existingBusiness.id;
          
          // STEP 3: Create business role only if business exists
          const { createOrUpdateBusinessRole } = await import("../services/businesses");
          await createOrUpdateBusinessRole(jobData.location, jobData.role, jobData.salary);
          console.log("✅ Business role updated");
        } else {
          console.log("ℹ️ Business not in database, skipping role creation");
        }
      } catch (roleError) {
        console.error("Error with business role:", roleError);
      }

      // STEP 4: Always create post
      const { createPost } = await import("../services/posts");
      await createPost(
        `New Job Update! ${jobData.salary}/${jobData.timePeriod} for ${jobData.role} 😳`,
        "job_update",
        businessId,
        jobData.role,
        jobData.timePeriod,
        salary,
      );
      console.log("✅ Post created");
      
    } catch (error) {
      console.error("Error updating job:", error);
    }
  };

  // NEW: Handle saving location when user clicks on a business
  const handleLocationSave = (location: string, fullLocation: string) => {
    console.log("Saving clicked business location:", { location, fullLocation });
    setUserData((prev) => {
      if (prev) {
        return {
          ...prev,
          location: location,
          fullLocation: fullLocation,
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
      setShowBusinessDetails(false);
      return;
    }

    // Set business IMMEDIATELY to show preview right away
    setSelectedBusiness(business);
    setFilteredBusinessId(null);

    // Save the clicked business location
    if (business.name) {
      handleLocationSave(business.name, business.name);
    }

    // Check if we need full details: missing atmosphere, missing roles, OR roles without IDs
    const needsFullDetails = !business.atmosphere?.length || 
                             !business.roles?.length ||
                             (business.roles && business.roles.length > 0 && !business.roles[0]?.id);

    // Fetch full details in background if needed
    if (needsFullDetails) {
      fetchFullBusinessDetails(business.id).then(fullBusiness => {
        if (fullBusiness) {
          setSelectedBusiness(fullBusiness);
        }
      });
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

  const handleFlyToBusiness = async (businessId: string, post?: any) => {
    console.log('🎯 handleFlyToBusiness called for:', businessId);
    const startTime = performance.now();
    
    // Change slide immediately
    setCurrentSlide(1);
    
    // Find business in local state
    let business = businesses.find((b) => b.id === businessId);
    
    // Check if business needs full details loaded
    const needsFullDetails = !business?.roles?.length || 
                            !business?.atmosphere?.length ||
                            (business?.roles && business.roles.length > 0 && !business.roles[0]?.id);
    
    // Start loading full details IMMEDIATELY in background if needed
    let detailsPromise: Promise<any> | null = null;
    if (needsFullDetails) {
      console.log('🔄 Starting background load of business details during fly...');
      detailsPromise = fetchFullBusinessDetails(businessId).then(fullBusiness => {
        if (fullBusiness) {
          console.log('✅ Background load completed, updating business');
          setSelectedBusiness(fullBusiness);
        }
        return fullBusiness;
      });
    }
    
    // Fast path: Use coordinates from post if available
    if (post?.businessLat && post?.businessLng) {
      console.log(`⚡ Fast fly-to using post coordinates in ${performance.now() - startTime}ms`);
      
      // Create minimal business object from post if not in state
      if (!business && post.businessName) {
        business = {
          id: businessId,
          name: post.businessName,
          position: { lat: post.businessLat, lng: post.businessLng },
          atmosphere: [],
          roles: []
        };
      }
      
      // Set business immediately to show preview right away
      if (business) {
        setSelectedBusiness(business);
        setShowBusinessDetails(true);
      }
      
      window.dispatchEvent(new CustomEvent('flyToBusiness', {
        detail: {
          lat: post.businessLat,
          lng: post.businessLng,
          businessId: businessId
        }
      }));
      
      // Details are loading in background already
      return;
    }
    
    console.log('📍 Found business in state:', { 
      found: !!business, 
      hasPosition: !!business?.position,
      hasLat: !!business?.position?.lat,
      hasLng: !!business?.position?.lng,
      coords: business?.position 
    });
    
    if (business?.position?.lat && business?.position?.lng) {
      console.log('✅ Using cached business coordinates', performance.now() - startTime, 'ms');
      setSelectedBusiness(business);
      setShowBusinessDetails(true);
      window.dispatchEvent(new CustomEvent('flyToBusiness', {
        detail: {
          lat: business.position.lat,
          lng: business.position.lng,
          businessId: businessId
        }
      }));
      
      // Details are loading in background already
      return;
    }
    
    // Coordinates missing - try to fetch full details
    console.log('⏳ Coordinates missing, fetching full business details...', performance.now() - startTime, 'ms');
    
    // Set partial business immediately if available
    if (business) {
      setSelectedBusiness(business);
    }
    
    try {
      const fullBusiness = await fetchFullBusinessDetails(businessId);
      
      if (!fullBusiness) {
        console.error('❌ Failed to fetch business details (returned null)', performance.now() - startTime, 'ms');
        return;
      }
      
      if (!fullBusiness.position?.lat || !fullBusiness.position?.lng) {
        console.error('❌ Business details missing coordinates', performance.now() - startTime, 'ms');
        return;
      }
      
      console.log('✅ Successfully fetched details, dispatching flyTo', performance.now() - startTime, 'ms');
      setSelectedBusiness(fullBusiness);
      setShowBusinessDetails(true);
      window.dispatchEvent(new CustomEvent('flyToBusiness', {
        detail: {
          lat: fullBusiness.position.lat,
          lng: fullBusiness.position.lng,
          businessId: businessId
        }
      }));
      
    } catch (error) {
      console.error('❌ Error in handleFlyToBusiness:', error, performance.now() - startTime, 'ms');
    }
  };

  // Remove handlePostVote and handlePostDelete - now handled by ExplorePage directly

  const handleRoleVote = async (businessId: string, roleIndex: number, voteType: "up" | "down") => {
    console.log('🗳️ MobileApp.handleRoleVote called:', { businessId, roleIndex, voteType });
    
    // Find the role ID from the business
    // Check selectedBusiness first since that's what's being displayed
    let business = selectedBusiness?.id === businessId 
      ? selectedBusiness 
      : businesses.find((b) => b.id === businessId);
    
    console.log('📍 Found business:', {
      found: !!business,
      hasRoles: !!business?.roles,
      roleCount: business?.roles?.length,
      targetRole: business?.roles?.[roleIndex],
      hasRoleId: !!business?.roles?.[roleIndex]?.id
    });

    // If business doesn't have role IDs, fetch full details first
    // Defensive check - should not happen if handleBusinessClick works correctly
    if (!business?.roles?.[roleIndex]?.id) {
      console.error("❌ Role missing ID - this should not happen!", { 
        businessId, 
        roleIndex,
        business: business,
        role: business?.roles?.[roleIndex]
      });
      alert('Unable to vote: Role data is incomplete. Please try closing and reopening the business details.');
      return;
    }

    const roleId = business.roles[roleIndex].id;
    console.log('✅ Role ID found:', roleId);
    const role = business.roles[roleIndex];
    
    // Mark role as voting
    setVotingRoles(prev => new Set(prev).add(roleId));

    try {
      // Import utilities
      const { calculateVoteChange } = await import('@/utils/voteCalculations');
      const { persistVote } = await import('@/services/voting');

      // Calculate new state optimistically
      const { newUserVote, newTotal } = calculateVoteChange(
        role.userVote,
        voteType,
        role.votesTotal
      );

      // Store previous state for rollback
      const previousVotesTotal = role.votesTotal;
      const previousUserVote = role.userVote;

      // Update UI immediately - both businesses array and selectedBusiness
      let updatedBusinessForSelection: Business | null = null;

      setBusinesses((prev) =>
        prev.map((b) => {
          if (b.id === businessId && b.roles) {
            const updatedBusiness = {
              ...b,
              roles: b.roles.map((r, idx) =>
                idx === roleIndex
                  ? { ...r, votesTotal: newTotal, userVote: newUserVote }
                  : r
              ),
            };
            
            // Store for selectedBusiness update
            if (selectedBusiness?.id === businessId) {
              updatedBusinessForSelection = updatedBusiness;
            }
            
            return updatedBusiness;
          }
          return b;
        })
      );

      // Update selectedBusiness separately to avoid closure issues
      if (updatedBusinessForSelection) {
        setSelectedBusiness(updatedBusinessForSelection);
      }

      // Persist in background
      const dbVoteType = newUserVote === 'up' ? 'upvote' : newUserVote === 'down' ? 'downvote' : null;
      const result = await persistVote('role_votes', 'business_role_id', roleId, dbVoteType);

      if (!result.success) {
        console.error("❌ Failed to persist vote:", result.error);
        alert('Vote failed to save. Please try again.');
        // Rollback on error - both businesses array and selectedBusiness
        let rolledBackBusinessForSelection: Business | null = null;

        setBusinesses((prev) =>
          prev.map((b) => {
            if (b.id === businessId && b.roles) {
              const rolledBackBusiness = {
                ...b,
                roles: b.roles.map((r, idx) =>
                  idx === roleIndex
                    ? { ...r, votesTotal: previousVotesTotal, userVote: previousUserVote }
                    : r
                ),
              };
              
              // Store for selectedBusiness update
              if (selectedBusiness?.id === businessId) {
                rolledBackBusinessForSelection = rolledBackBusiness;
              }
              
              return rolledBackBusiness;
            }
            return b;
          })
        );

        // Update selectedBusiness separately to avoid closure issues
        if (rolledBackBusinessForSelection) {
          setSelectedBusiness(rolledBackBusinessForSelection);
        }
      } else {
        console.log('✅ Vote persisted, syncing with database...');
        
        // Sync with database to get actual votes_total and userVote
        try {
          const refreshedBusiness = await fetchFullBusinessDetails(businessId);
          
          if (refreshedBusiness) {
            // Update both businesses array and selectedBusiness with database values
            setBusinesses((prev) =>
              prev.map((b) => b.id === businessId ? refreshedBusiness : b)
            );
            
            if (selectedBusiness?.id === businessId) {
              setSelectedBusiness(refreshedBusiness);
            }
            
            console.log('✅ Business synced with database:', {
              roleIndex,
              dbVotesTotal: refreshedBusiness.roles?.[roleIndex]?.votesTotal,
              dbUserVote: refreshedBusiness.roles?.[roleIndex]?.userVote
            });
          }
        } catch (syncError) {
          console.warn('⚠️ Failed to sync with database after vote:', syncError);
          // Don't rollback - the vote succeeded, we just couldn't refresh
          // The optimistic value is close enough
        }
      }
    } finally {
      // Always clear the voting state
      setVotingRoles(prev => {
        const next = new Set(prev);
        next.delete(roleId);
        return next;
      });
    }
  };

  // Sync selectedBusiness when businesses data changes (for voting updates)
  useEffect(() => {
    if (selectedBusiness) {
      const updatedBusiness = businesses.find((b) => b.id === selectedBusiness.id);
      if (updatedBusiness && updatedBusiness !== selectedBusiness) {
        setSelectedBusiness(updatedBusiness);
      }
    }
  }, [businesses]);

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

    if (isNearLeftEdge || isNearRightEdge) {
      if (info.offset.x > threshold && currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
      } else if (info.offset.x < -threshold && currentSlide < 2) {
        setCurrentSlide(currentSlide + 1);
      }
    }
  };

  // Calculate card position for mobile peek behavior
  const getSettingsCardPosition = () => {
    if (!isMobile) return currentSlide === 0 ? "0%" : "-100%";
    if (currentSlide === 0) return "0%";        // Fully visible
    if (currentSlide === 1) return "-97.75%";   // Shows 2.5% of the 90vw card
    return "-200%";                              // Hidden
  };

  const getExploreCardPosition = () => {
    if (!isMobile) return currentSlide === 2 ? "0%" : "100%";
    if (currentSlide === 2) return "0%";        // Fully visible
    if (currentSlide === 1) return "97.75%";    // Shows 2.5% of the 90vw card
    return "200%";                               // Hidden
  };

  const shouldRenderSettingsCard = () => {
    return isMobile || currentSlide === 0;
  };

  const shouldRenderExploreCard = () => {
    return isMobile || currentSlide === 2;
  };

  return (
    <div className={`fixed inset-0 ${!isMobile ? "overflow-hidden" : ""}`}>
      {/* Show loading state while initializing */}
      {currentView === "loading" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <Skeleton className="w-full h-full" />
        </div>
      )}
      
      {/* Map is always the background */}
      <Suspense fallback={<Skeleton className="w-full h-full" />}>
        <HomePage
          currentSlide={currentSlide}
          currentView={currentView === "loading" ? "main" : currentView}
          selectedBusiness={selectedBusiness}
          onBusinessSelect={handleBusinessClick}
          posts={posts}
          onBusinessStoriesClick={handleBusinessStoriesClick}
          onPostClick={(post) => {
            setExpandedPost(post.id);
          }}
          onRoleVote={handleRoleVote}
          onLocationSave={handleLocationSave}
          votingRoles={votingRoles}
          showBusinessDetails={showBusinessDetails}
          onShowBusinessDetails={() => setShowBusinessDetails(true)}
          onBackToPreview={() => setShowBusinessDetails(false)}
        />
      </Suspense>

      {/* Initiation Card - slides up and disappears */}
      {currentView === "initiation" && <InitiationPage onComplete={handleInitiationComplete} />}

      {/* Settings Card - slides from left */}
      {shouldRenderSettingsCard() && (
        <motion.div
          animate={{ x: getSettingsCardPosition() }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          style={{ 
            pointerEvents: getSettingsCardPosition() === "-200%" ? "none" : "auto" 
          }}
          drag={isMobile ? "x" : false}
          dragConstraints={{ left: -200, right: 200 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x < -100 && currentSlide === 0) {
              setCurrentSlide(1);
            } else if (info.offset.x > 100 && currentSlide === 1) {
              setCurrentSlide(0);
            }
          }}
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <SettingsPage
              initialData={userData || { salary: "", role: "", location: "", businessName: "", timePeriod: "HR" }}
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
                  const searchEvent = new CustomEvent("triggerSearch", { detail: searchTerm });
                  window.dispatchEvent(searchEvent);
                }, 100);
              }}
            />
          </Suspense>
        </motion.div>
      )}

      {/* Explore Card - slides from right */}
      {shouldRenderExploreCard() && (
        <motion.div
          animate={{ x: getExploreCardPosition() }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          style={{ 
            pointerEvents: getExploreCardPosition() === "200%" ? "none" : "auto" 
          }}
          drag={isMobile ? "x" : false}
          dragConstraints={{ left: -200, right: 200 }}
          dragElastic={0.1}
          onDragEnd={(event, info) => {
            if (info.offset.x > 100 && currentSlide === 2) {
              setCurrentSlide(1);
            } else if (info.offset.x < -100 && currentSlide === 1) {
              setCurrentSlide(2);
            }
          }}
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <ExplorePage
              filteredBusinessId={filteredBusinessId || undefined}
              filteredUserStories={filteredUserStories}
              onBusinessView={(businessId) => {
                const business = businesses.find((b) => b.id === businessId);
                if (business) {
                  setSelectedBusiness(business); // ✅ MapLibreMap will auto-fly
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
                  [postId]: [...(comments[postId] || []), comment],
                });
              }}
              onBackToAllPosts={handleBackToAllPosts}
              onNavigateToHomeBusiness={(businessId) => {
                handleFlyToBusiness(businessId);
              }}
              onFlyToBusiness={handleFlyToBusiness}
            />
          </Suspense>
        </motion.div>
      )}

      {/* Swipe detection overlay - only at screen edges */}
      <div className="absolute inset-0 z-10 pointer-events-none">
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
                  document.removeEventListener("touchmove", handleTouchMove);
                  document.removeEventListener("touchend", handleTouchEnd);
                  return;
                }
                const moveTouch = moveEvent.touches[0];
                const deltaX = moveTouch.clientX - startX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide - 1);
                  document.removeEventListener("touchmove", handleTouchMove);
                  document.removeEventListener("touchend", handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener("touchmove", handleTouchMove);
                document.removeEventListener("touchend", handleTouchEnd);
              };
              document.addEventListener("touchmove", handleTouchMove);
              document.addEventListener("touchend", handleTouchEnd);
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
                  document.removeEventListener("touchmove", handleTouchMove);
                  document.removeEventListener("touchend", handleTouchEnd);
                  return;
                }
                const moveTouch = moveEvent.touches[0];
                const deltaX = startX - moveTouch.clientX;
                if (deltaX > 100) {
                  setCurrentSlide(currentSlide + 1);
                  document.removeEventListener("touchmove", handleTouchMove);
                  document.removeEventListener("touchend", handleTouchEnd);
                }
              };
              const handleTouchEnd = () => {
                document.removeEventListener("touchmove", handleTouchMove);
                document.removeEventListener("touchend", handleTouchEnd);
              };
              document.addEventListener("touchmove", handleTouchMove);
              document.addEventListener("touchend", handleTouchEnd);
            }
          }}
        />
      </div>

      {/* Slide indicators - only show on desktop */}
      {!isMobile && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-50">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentSlide ? "bg-app-yellow" : "bg-app-gray-light"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileApp;
