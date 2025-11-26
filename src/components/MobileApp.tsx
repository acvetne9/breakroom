import React, { useState, useRef, useEffect, Suspense, useCallback, useMemo } from "react";
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
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { deviceId, loading: deviceLoading } = useDevice();
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
  const { posts } = usePostsContext();

  // Ref to prevent double initialization in React 18 StrictMode
  const hasInitialized = useRef(false);

  // Touch/Drag tracking refs
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartScrollTopRef = useRef(0);
  const isDraggingHorizontallyRef = useRef(false);
  const hasScrolledRef = useRef(false);
  const dragStartTimeRef = useRef(0);

  const hasProfile = useCallback(async (): Promise<boolean> => {
    if (!deviceId) return false;
    try {
      const { data, error } = await supabase.from("profiles").select("id").eq("id", deviceId).maybeSingle();
      if (error) {
        console.error("Error checking profile:", error);
        return false;
      }
      return !!data;
    } catch (error) {
      console.error("Error checking profile:", error);
      return false;
    }
  }, [deviceId]);

  const hasCurrentJob = useCallback(async (): Promise<boolean> => {
    if (!deviceId) return false;
    try {
      const { getCurrentJob } = await import("../services/currentJobs");
      const job = await getCurrentJob(deviceId);
      return job !== null;
    } catch (error) {
      console.error("Error checking current job:", error);
      return false;
    }
  }, [deviceId]);

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }

    if (deviceLoading || !deviceId) {
      return;
    }

    hasInitialized.current = true;

    const initializeApp = async () => {
      try {
        const profileExists = await hasProfile();
        const hasJob = await hasCurrentJob();
    
        if (hasJob) {
          const { getCurrentJob } = await import("../services/currentJobs");
          const currentJob = await getCurrentJob(deviceId);
          if (currentJob) {
            setUserData({
              salary: `$${currentJob.salary.toFixed(2)}`,
              role: currentJob.role,
              location: currentJob.location,
              fullLocation: currentJob.location,
              businessName: currentJob.business_name || "",
              timePeriod: currentJob.time_period || "HR",
            });
          }
          setCurrentView("main");
        } else if (!profileExists) {
          const { error } = await supabase.from("profiles").insert({ id: deviceId });
          if (error) {
            console.error("❌ Error creating profile row:", error);
          }
          setCurrentView("main");
        } else {
          setCurrentView("initiation");
        }
      } catch (error) {
        console.error("Error during app initialization:", error);
        setCurrentView("main");
      }
    };

    initializeApp();
  }, [deviceLoading, deviceId, hasProfile, hasCurrentJob]);

  useEffect(() => {
    if (currentSlide === 1 && currentView === "initiation" && deviceId) {
      const recheckCurrentJob = async () => {
        try {
          const hasJob = await hasCurrentJob();
          if (hasJob) {
            const { getCurrentJob } = await import("../services/currentJobs");
            const currentJob = await getCurrentJob(deviceId);
            if (currentJob) {
              setUserData({
                salary: `$${currentJob.salary.toFixed(2)}`,
                role: currentJob.role,
                location: currentJob.location,
                fullLocation: currentJob.location,
                businessName: currentJob.business_name || "",
                timePeriod: currentJob.time_period || "HR",
              });
              setCurrentView("main");
            }
          }
        } catch (error) {
          console.error("Error re-checking current job:", error);
        }
      };
      recheckCurrentJob();
    }
  }, [currentSlide, currentView, deviceId, hasCurrentJob]);

  const handleInitiationComplete = useCallback(async (data: UserData) => {
    if (!deviceId) {
      console.error("❌ No deviceId available");
      return;
    }

    setUserData(data);
    setCurrentView("main");

    try {
      const { saveCurrentJob } = await import("../services/currentJobs");
      const salary = parseFloat(data.salary.replace(/[^0-9.]/g, "")) || 0;

      await saveCurrentJob(deviceId, {
        role: data.role,
        salary: salary,
        location: data.location,
        business_name: data.businessName || "",
        time_period: data.timePeriod || "HR",
      });

      let businessId: string | undefined;

      try {
        const { data: existingBusiness } = await supabase
          .from("businesses")
          .select("id")
          .ilike("name", data.location)
          .maybeSingle();

        if (existingBusiness) {
          businessId = existingBusiness.id;
          const { createOrUpdateBusinessRole } = await import("../services/businesses");
          await createOrUpdateBusinessRole(data.location, data.role, data.salary);
        }
      } catch (roleError) {
        console.error("Error with business role:", roleError);
      }

      const { createPost } = await import("../services/posts");
      await createPost(
        `New Job Update! ${data.salary}/${data.timePeriod || "HR"} for ${data.role} 😳`,
        "job_update",
        businessId,
        data.role,
        data.timePeriod,
        salary,
      );
    } catch (error) {
      console.error("❌ Error saving job data:", error);
    }
  }, [deviceId]);

  const handleJobUpdate = useCallback(async (jobData: {
    salary: string;
    role: string;
    location: string;
    businessName?: string;
    timePeriod: string;
  }) => {
    if (!deviceId) {
      console.error("❌ No deviceId available");
      return;
    }

    try {
      const { saveCurrentJob } = await import("../services/currentJobs");
      const salary = parseFloat(jobData.salary.replace(/[^0-9.]/g, "")) || 0;

      await saveCurrentJob(deviceId, {
        role: jobData.role,
        salary: salary,
        location: jobData.location,
        business_name: jobData.businessName || jobData.location,
        time_period: jobData.timePeriod,
      });

      setUserData((prev) =>
        prev
          ? {
              ...prev,
              salary: jobData.salary,
              role: jobData.role,
              location: jobData.location,
              businessName: jobData.businessName || jobData.location,
              timePeriod: jobData.timePeriod,
            }
          : null,
      );

      let businessId: string | undefined;

      try {
        const { data: existingBusiness } = await supabase
          .from("businesses")
          .select("id")
          .ilike("name", jobData.location)
          .maybeSingle();

        if (existingBusiness) {
          businessId = existingBusiness.id;
          const { createOrUpdateBusinessRole } = await import("../services/businesses");
          await createOrUpdateBusinessRole(jobData.location, jobData.role, jobData.salary);
        }
      } catch (roleError) {
        console.error("Error with business role:", roleError);
      }

      const { createPost } = await import("../services/posts");
      await createPost(
        `New Job Update! ${jobData.salary}/${jobData.timePeriod} for ${jobData.role} 😳`,
        "job_update",
        businessId,
        jobData.role,
        jobData.timePeriod,
        salary,
      );
    } catch (error) {
      console.error("Error updating job:", error);
    }
  }, [deviceId]);

  const handleLocationSave = useCallback((location: string, fullLocation: string) => {
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
  }, []);

  const handleBusinessClick = useCallback(async (business: any) => {
    if (!business) {
      setSelectedBusiness(null);
      setFilteredBusinessId(null);
      setShowBusinessDetails(false);
      return;
    }

    setSelectedBusiness(business);
    setFilteredBusinessId(null);

    if (business.name) {
      handleLocationSave(business.name, business.name);
    }

    const needsFullDetails =
      !business.atmosphere?.length ||
      !business.roles?.length ||
      (business.roles && business.roles.length > 0 && !business.roles[0]?.id);

    if (needsFullDetails) {
      fetchFullBusinessDetails(business.id).then((fullBusiness) => {
        if (fullBusiness) {
          setSelectedBusiness(fullBusiness);
        }
      });
    }
  }, [fetchFullBusinessDetails, handleLocationSave]);

  const handleBusinessStoriesClick = useCallback((businessId: string) => {
    setFilteredBusinessId(businessId);
    setFilteredUserStories(false); // Clear user stories filter
    setCurrentSlide(2);
  }, []);

  const handleUserStoriesClick = useCallback(() => {
    console.log('📖 My Stories clicked - setting filteredUserStories to true');
    setFilteredUserStories(true);
    setFilteredBusinessId(null); // Clear any business filter
    setCurrentSlide(2);
  }, []);

  const handleBackToAllPosts = useCallback(() => {
    console.log('⬅️ Back to all posts clicked');
    setFilteredBusinessId(null);
    setFilteredUserStories(false);
  }, []);

  const handleFlyToBusiness = useCallback(async (businessId: string, post?: any) => {
    const startTime = performance.now();
    setCurrentSlide(1);

    let business = businesses.find((b) => b.id === businessId);

    const needsFullDetails =
      !business?.roles?.length ||
      !business?.atmosphere?.length ||
      (business?.roles && business.roles.length > 0 && !business.roles[0]?.id);

    if (needsFullDetails) {
      fetchFullBusinessDetails(businessId).then((fullBusiness) => {
        if (fullBusiness) {
          setSelectedBusiness(fullBusiness);
        }
      });
    }

    if (post?.businessLat && post?.businessLng) {
      if (!business && post.businessName) {
        business = {
          id: businessId,
          name: post.businessName,
          position: { lat: post.businessLat, lng: post.businessLng },
          atmosphere: [],
          roles: [],
        };
      }

      if (business) {
        setSelectedBusiness(business);
        setShowBusinessDetails(true);
      }

      window.dispatchEvent(
        new CustomEvent("flyToBusiness", {
          detail: {
            lat: post.businessLat,
            lng: post.businessLng,
            businessId: businessId,
          },
        }),
      );
      return;
    }

    if (business?.position?.lat && business?.position?.lng) {
      setSelectedBusiness(business);
      setShowBusinessDetails(true);
      window.dispatchEvent(
        new CustomEvent("flyToBusiness", {
          detail: {
            lat: business.position.lat,
            lng: business.position.lng,
            businessId: businessId,
          },
        }),
      );
      return;
    }

    if (business) {
      setSelectedBusiness(business);
    }

    try {
      const fullBusiness = await fetchFullBusinessDetails(businessId);

      if (!fullBusiness) {
        console.error("❌ Failed to fetch business details (returned null)", performance.now() - startTime, "ms");
        return;
      }

      if (!fullBusiness.position?.lat || !fullBusiness.position?.lng) {
        console.error("❌ Business details missing coordinates", performance.now() - startTime, "ms");
        return;
      }

      setSelectedBusiness(fullBusiness);
      setShowBusinessDetails(true);
      window.dispatchEvent(
        new CustomEvent("flyToBusiness", {
          detail: {
            lat: fullBusiness.position.lat,
            lng: fullBusiness.position.lng,
            businessId: businessId,
          },
        }),
      );
    } catch (error) {
      console.error("❌ Error in handleFlyToBusiness:", error, performance.now() - startTime, "ms");
    }
  }, [businesses, fetchFullBusinessDetails]);

  const handleRoleVote = useCallback(async (businessId: string, roleIndex: number, voteType: "up" | "down") => {
    let business = selectedBusiness?.id === businessId ? selectedBusiness : businesses.find((b) => b.id === businessId);

    if (!business?.roles?.[roleIndex]?.id) {
      console.error("❌ Role missing ID - this should not happen!");
      alert("Unable to vote: Role data is incomplete. Please try closing and reopening the business details.");
      return;
    }

    const roleId = business.roles[roleIndex].id;
    const role = business.roles[roleIndex];

    setVotingRoles((prev) => new Set(prev).add(roleId));

    try {
      const { calculateVoteChange } = await import("@/utils/voteCalculations");
      const { persistVote } = await import("@/services/voting");

      const { newUserVote, newTotal } = calculateVoteChange(role.userVote, voteType, role.votesTotal);

      const previousVotesTotal = role.votesTotal;
      const previousUserVote = role.userVote;

      let updatedBusinessForSelection: Business | null = null;

      setBusinesses((prev) =>
        prev.map((b) => {
          if (b.id === businessId && b.roles) {
            const updatedBusiness = {
              ...b,
              roles: b.roles.map((r, idx) =>
                idx === roleIndex ? { ...r, votesTotal: newTotal, userVote: newUserVote } : r,
              ),
            };

            if (selectedBusiness?.id === businessId) {
              updatedBusinessForSelection = updatedBusiness;
            }

            return updatedBusiness;
          }
          return b;
        }),
      );

      if (updatedBusinessForSelection) {
        setSelectedBusiness(updatedBusinessForSelection);
      }

      const dbVoteType = newUserVote === "up" ? "upvote" : newUserVote === "down" ? "downvote" : null;
      const result = await persistVote("role_votes", "business_role_id", roleId, dbVoteType);

      if (!result.success) {
        console.error("❌ Failed to persist vote:", result.error);
        alert("Vote failed to save. Please try again.");

        let rolledBackBusinessForSelection: Business | null = null;

        setBusinesses((prev) =>
          prev.map((b) => {
            if (b.id === businessId && b.roles) {
              const rolledBackBusiness = {
                ...b,
                roles: b.roles.map((r, idx) =>
                  idx === roleIndex ? { ...r, votesTotal: previousVotesTotal, userVote: previousUserVote } : r,
                ),
              };

              if (selectedBusiness?.id === businessId) {
                rolledBackBusinessForSelection = rolledBackBusiness;
              }

              return rolledBackBusiness;
            }
            return b;
          }),
        );

        if (rolledBackBusinessForSelection) {
          setSelectedBusiness(rolledBackBusinessForSelection);
        }
      } else {
        try {
          const refreshedBusiness = await fetchFullBusinessDetails(businessId);

          if (refreshedBusiness) {
            setBusinesses((prev) => prev.map((b) => (b.id === businessId ? refreshedBusiness : b)));

            if (selectedBusiness?.id === businessId) {
              setSelectedBusiness(refreshedBusiness);
            }
          }
        } catch (syncError) {
          console.warn("⚠️ Failed to sync with database after vote:", syncError);
        }
      }
    } finally {
      setVotingRoles((prev) => {
        const next = new Set(prev);
        next.delete(roleId);
        return next;
      });
    }
  }, [businesses, selectedBusiness, setBusinesses, fetchFullBusinessDetails]);

  useEffect(() => {
    if (selectedBusiness) {
      const updatedBusiness = businesses.find((b) => b.id === selectedBusiness.id);
      if (updatedBusiness && updatedBusiness !== selectedBusiness) {
        setSelectedBusiness(updatedBusiness);
      }
    }
  }, [businesses, selectedBusiness]);

  useEffect(() => {
    if (currentSlide === 2 || currentSlide === 0) {
      if (selectedBusiness) {
        setPreviouslySelectedBusiness(selectedBusiness);
        setSelectedBusiness(null);
      }
    } else if (currentSlide === 1 && previouslySelectedBusiness) {
      setSelectedBusiness(previouslySelectedBusiness);
      setPreviouslySelectedBusiness(null);
    }

    // Only clear filteredUserStories if moving away from slide 2 AND it wasn't just set
    // This prevents race conditions where the state is cleared right after being set
  }, [currentSlide, selectedBusiness, previouslySelectedBusiness]);

  const getSettingsCardPosition = useCallback(() => {
    if (!isMobile) return currentSlide === 0 ? "0%" : "-100%";
    if (currentSlide === 0) return "0%";
    if (currentSlide === 1) return "-92.75%";
    return "-200%";
  }, [isMobile, currentSlide]);

  const getExploreCardPosition = useCallback(() => {
    if (!isMobile) return currentSlide === 2 ? "0%" : "100%";
    if (currentSlide === 2) return "0%";
    if (currentSlide === 1) return "92.75%";
    return "200%";
  }, [isMobile, currentSlide]);

  const shouldRenderSettingsCard = useMemo(() => {
    return isMobile || currentSlide === 0;
  }, [isMobile, currentSlide]);

  const shouldRenderExploreCard = useMemo(() => {
    return isMobile || currentSlide === 2;
  }, [isMobile, currentSlide]);

  const handlePostClick = useCallback((post: Post) => {
    setExpandedPost(post.id);
  }, []);

  const handleShowBusinessDetails = useCallback(() => {
    setShowBusinessDetails(true);
  }, []);

  const handleBackToPreview = useCallback(() => {
    setShowBusinessDetails(false);
  }, []);

  const handleSettingsPostClick = useCallback((post: Post) => {
    setExpandedPost(post.id);
    setCurrentSlide(2);
  }, []);

  const handleSearchTrigger = useCallback((searchTerm: string) => {
    setCurrentSlide(1);
    setTimeout(() => {
      const searchEvent = new CustomEvent("triggerSearch", { detail: searchTerm });
      window.dispatchEvent(searchEvent);
    }, 100);
  }, []);

  const handleExploreBusinessView = useCallback((businessId: string) => {
    const business = businesses.find((b) => b.id === businessId);
    if (business) {
      setSelectedBusiness(business);
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
  }, [businesses, fetchFullBusinessDetails]);

  const handleExpandedPostChange = useCallback((postId: string | null) => {
    setExpandedPost(postId);
  }, []);

  const handleCommentSubmit = useCallback((postId: string, comment: string) => {
    setComments((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] || []), comment],
    }));
  }, []);

  // ==================== SMART TOUCH HANDLERS ====================
  
  const handleTouchStart = useCallback((e: React.TouchEvent, cardType: 'settings' | 'explore') => {
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    dragStartTimeRef.current = Date.now();
    
    // Track initial scroll position
    const scrollableElement = e.currentTarget.querySelector('[data-scrollable]');
    if (scrollableElement) {
      touchStartScrollTopRef.current = scrollableElement.scrollTop;
    }
    
    isDraggingHorizontallyRef.current = false;
    hasScrolledRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent, cardType: 'settings' | 'explore') => {
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartXRef.current);
    const deltaY = Math.abs(touch.clientY - touchStartYRef.current);
    
    // Determine intent VERY early (after just 5px)
    if (!isDraggingHorizontallyRef.current && !hasScrolledRef.current && (deltaX > 5 || deltaY > 5)) {
      // If more horizontal than vertical, treat as swipe
      if (deltaX > deltaY * 1.5) {
        isDraggingHorizontallyRef.current = true;
        // Prevent scrolling during horizontal swipe
        e.preventDefault();
      } else {
        // More vertical - allow scroll
        hasScrolledRef.current = true;
      }
    }
    
    // Continue preventing scroll if we're swiping horizontally
    if (isDraggingHorizontallyRef.current) {
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, cardType: 'settings' | 'explore') => {
    if (!isDraggingHorizontallyRef.current) {
      return;
    }
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaTime = Date.now() - dragStartTimeRef.current;
    const velocity = Math.abs(deltaX) / deltaTime; // px/ms
    
    // Very forgiving thresholds for mobile
    const DISTANCE_THRESHOLD = 30; // Just 30px
    const VELOCITY_THRESHOLD = 0.3; // 0.3 px/ms (300 px/s)
    
    const isQuickSwipe = velocity > VELOCITY_THRESHOLD;
    const isLongSwipe = Math.abs(deltaX) > DISTANCE_THRESHOLD;
    
    if (isQuickSwipe || isLongSwipe) {
      if (cardType === 'settings') {
        // Settings card: swipe left to go to home, swipe right from home to go to settings
        if (currentSlide === 0 && deltaX < -15) {
          setCurrentSlide(1);
        } else if (currentSlide === 1 && deltaX > 15) {
          setCurrentSlide(0);
        }
      } else {
        // Explore card: swipe right to go to home, swipe left from home to go to explore
        if (currentSlide === 2 && deltaX > 15) {
          setCurrentSlide(1);
        } else if (currentSlide === 1 && deltaX < -15) {
          setCurrentSlide(2);
        }
      }
    }
    
    // Reset
    isDraggingHorizontallyRef.current = false;
    hasScrolledRef.current = false;
  }, [currentSlide]);

  return (
    <div className={`fixed inset-0 ${!isMobile ? "overflow-hidden" : ""}`}>
      {currentView === "loading" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <Skeleton className="w-full h-full" />
        </div>
      )}
  
      <Suspense fallback={<Skeleton className="w-full h-full" />}>
        <HomePage
          currentSlide={currentSlide}
          currentView={currentView === "loading" ? "main" : currentView}
          selectedBusiness={selectedBusiness}
          onBusinessSelect={handleBusinessClick}
          posts={posts}
          onBusinessStoriesClick={handleBusinessStoriesClick}
          onPostClick={handlePostClick}
          onRoleVote={handleRoleVote}
          onLocationSave={handleLocationSave}
          votingRoles={votingRoles}
          showBusinessDetails={showBusinessDetails}
          onShowBusinessDetails={handleShowBusinessDetails}
          onBackToPreview={handleBackToPreview}
        />
      </Suspense>
  
      {shouldRenderSettingsCard && currentView !== "initiation" && (
        <motion.div
          animate={{ x: getSettingsCardPosition() }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          style={{
            pointerEvents: currentSlide === 0 || (isMobile && currentSlide === 1) ? "auto" : "none",
          }}
          onTouchStart={(e) => handleTouchStart(e, 'settings')}
          onTouchMove={(e) => handleTouchMove(e, 'settings')}
          onTouchEnd={(e) => handleTouchEnd(e, 'settings')}
        >
          <div data-scrollable className="h-full overflow-y-auto">
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <SettingsPage
                initialData={userData || { salary: "", role: "", location: "", businessName: "", timePeriod: "HR" }}
                onStoriesClick={handleUserStoriesClick}
                onPostClick={handleSettingsPostClick}
                onJobUpdate={handleJobUpdate}
                onSearchTrigger={handleSearchTrigger}
              />
            </Suspense>
          </div>
        </motion.div>
      )}
  
      {shouldRenderExploreCard && currentView !== "initiation" && (
        <motion.div
          animate={{ x: getExploreCardPosition() }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
          style={{
            pointerEvents: currentSlide === 2 || (isMobile && currentSlide === 1) ? "auto" : "none",
          }}
          onTouchStart={(e) => handleTouchStart(e, 'explore')}
          onTouchMove={(e) => handleTouchMove(e, 'explore')}
          onTouchEnd={(e) => handleTouchEnd(e, 'explore')}
        >
          <div data-scrollable className="h-full overflow-y-auto">
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <ExplorePage
                currentSlide={currentSlide}
                filteredBusinessId={filteredBusinessId || undefined}
                filteredUserStories={filteredUserStories}
                onBusinessView={handleExploreBusinessView}
                onExpandedPostChange={handleExpandedPostChange}
                onCommentSubmit={handleCommentSubmit}
                onBackToAllPosts={handleBackToAllPosts}
                onNavigateToHomeBusiness={handleFlyToBusiness}
                onFlyToBusiness={handleFlyToBusiness}
              />
            </Suspense>
          </div>
        </motion.div>
      )}
  
      {currentView === "initiation" && (
        <div className="fixed inset-0 z-[60]">
          <InitiationPage onComplete={handleInitiationComplete} />
        </div>
      )}
  
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
}

export default MobileApp;
