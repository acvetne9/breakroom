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
  const [dragDirection, setDragDirection] = useState<'horizontal' | 'vertical' | null>(null);

  const constraintsRef = useRef(null);
  const { businesses, loading, setBusinesses, fetchFullBusinessDetails } = useBusinessesData();
  const { posts } = usePostsContext();

  // Ref to prevent double initialization in React 18 StrictMode
  const hasInitialized = useRef(false);

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
    setCurrentSlide(2);
  }, []);

  const handleUserStoriesClick = useCallback(() => {
    setFilteredUserStories(true);
    setCurrentSlide(2);
  }, []);

  const handleBackToAllPosts = useCallback(() => {
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

    if (currentSlide !== 2 && filteredUserStories) {
      setFilteredUserStories(false);
    }
  }, [currentSlide, selectedBusiness, previouslySelectedBusiness, filteredUserStories]);

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

  const settingsStyle = useMemo(() => {
    const position = getSettingsCardPosition();
    
    return {
      pointerEvents: (position === "-200%" ? "none" : "auto") as any,
      overflowY: (dragDirection === 'horizontal' ? 'hidden' : 'auto') as any,
      touchAction: (dragDirection === 'vertical' ? 'pan-y' : dragDirection === 'horizontal' ? 'pan-x' : 'auto') as any,
    };
  }, [getSettingsCardPosition, dragDirection]);

  const exploreStyle = useMemo(() => {
    const position = getExploreCardPosition();
    
    return {
      pointerEvents: (position === "200%" ? "none" : "auto") as any,
      overflowY: (dragDirection === 'horizontal' ? 'hidden' : 'auto') as any,
      touchAction: (dragDirection === 'vertical' ? 'pan-y' : dragDirection === 'horizontal' ? 'pan-x' : 'auto') as any,
    };
  }, [getExploreCardPosition, dragDirection]);

  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragDirectionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);

  const handleDragStart = useCallback((event: any, info: any) => {
    dragStartXRef.current = info.point.x;
    dragStartYRef.current = info.point.y;
    dragDirectionLockedRef.current = null;
    setDragDirection(null);
  }, []);

  const handleDrag = useCallback((event: any, info: any) => {
    // Only check direction once at the start of drag
    if (dragDirectionLockedRef.current === null) {
      const deltaX = Math.abs(info.point.x - dragStartXRef.current);
      const deltaY = Math.abs(info.point.y - dragStartYRef.current);
      
      // Only lock direction after significant movement (increased threshold)
      if (deltaX > 10 || deltaY > 10) {
        // Only lock to vertical if it's CLEARLY vertical (3x more vertical than horizontal)
        if (deltaY > deltaX * 3) {
          dragDirectionLockedRef.current = 'vertical';
          setDragDirection('vertical');
        } else if (deltaX > deltaY) {
          // Lock to horizontal if more horizontal than vertical
          dragDirectionLockedRef.current = 'horizontal';
          setDragDirection('horizontal');
        }
      }
    }
  }, []);

  const handleSettingsDragEnd = useCallback((event: any, info: any) => {
    // Only process if horizontal drag
    if (dragDirectionLockedRef.current === 'horizontal') {
      // When ON settings page (slide 0), swipe LEFT (negative offset) goes to home (slide 1)
      if (currentSlide === 0 && info.offset.x < -50) {
        setCurrentSlide(1);
      }
      // When ON home page (slide 1), swipe RIGHT (positive offset) goes to settings (slide 0)
      else if (currentSlide === 1 && info.offset.x > 50) {
        setCurrentSlide(0);
      }
    }
    
    // Reset
    dragDirectionLockedRef.current = null;
    setDragDirection(null);
  }, [currentSlide]);

  const handleExploreDragEnd = useCallback((event: any, info: any) => {
    // Only process if horizontal drag
    if (dragDirectionLockedRef.current === 'horizontal') {
      // When ON explore page (slide 2), swipe RIGHT (positive offset) goes to home (slide 1)
      if (currentSlide === 2 && info.offset.x > 50) {
        setCurrentSlide(1);
      }
      // When ON home page (slide 1), swipe LEFT (negative offset) goes to explore (slide 2)
      else if (currentSlide === 1 && info.offset.x < -50) {
        setCurrentSlide(2);
      }
    }
    
    // Reset
    dragDirectionLockedRef.current = null;
    setDragDirection(null);
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
          transition={{ type: "spring", stiffness: 250, damping: 28, duration: 0.3 }}
          className="absolute inset-0 z-20"
          style={settingsStyle as any}
          drag={isMobile ? "x" : false}
          dragConstraints={{
            // On settings page (0): allow dragging left to go home
            // On home page (1): allow dragging right to bring settings back
            left: -200,
            right: 200,
          }}
          dragElastic={0.2}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleSettingsDragEnd}
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <SettingsPage
              initialData={userData || { salary: "", role: "", location: "", businessName: "", timePeriod: "HR" }}
              onStoriesClick={handleUserStoriesClick}
              onPostClick={handleSettingsPostClick}
              onJobUpdate={handleJobUpdate}
              onSearchTrigger={handleSearchTrigger}
            />
          </Suspense>
        </motion.div>
      )}
  
      {shouldRenderExploreCard && currentView !== "initiation" && (
        <motion.div
          animate={{ x: getExploreCardPosition() }}
          transition={{ type: "spring", stiffness: 250, damping: 28, duration: 0.3 }}
          className="absolute inset-0 z-20"
          style={exploreStyle as any}
          drag={isMobile ? "x" : false}
          dragConstraints={{
            // On explore page (2): allow dragging right to go home  
            // On home page (1): allow dragging left to bring explore
            left: -200,
            right: 200,
          }}
          dragElastic={0.2}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleExploreDragEnd}
        >
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
        </motion.div>
      )}
  
      {currentView === "initiation" && (
        <div className="fixed inset-0 z-[60]">
          <InitiationPage onComplete={handleInitiationComplete} />
        </div>
      )}
  
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* ... rest of touch handlers ... */}
      </div>
  
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
