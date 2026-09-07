import React, { useState, useRef, useEffect, Suspense, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import InitiationPage from "./InitiationPage";
import { supabase } from "@/integrations/supabase/client";
import { useDevice } from "@/contexts/DeviceContext";
import { parseSalaryInput } from "@/utils/salaryFormat";
import { getCurrentJob, saveCurrentJob } from "@/services/currentJobs";
import { createOrUpdateBusinessRole, getFullBusinessDetailsCached, setCachedBusiness } from "@/services/businesses";
import { createPost, type Post } from "@/services/posts";
import { applyOptimisticVote } from "@/hooks/useOptimisticVote";
import { persistVote } from "@/services/voting";
import type { Business } from "@/types/business";
import type { MapHandle } from "./MapLibreMap";
import { usePostsContext } from "./PostsProvider";

const HomePage = React.lazy(() => import("./HomePage"));
const SettingsPage = React.lazy(() => import("./SettingsPage"));
const ExplorePage = React.lazy(() => import("./ExplorePage"));

interface UserData {
  salary: string;
  role: string;
  location: string;
  fullLocation?: string;
  businessName?: string;
  timePeriod: string;
}

/** A business whose roles came from the full-details query (roles carry ids). */
const hasFullDetails = (business: Business | null | undefined) =>
  !!business?.atmosphere?.length && !!business?.roles?.length && !!business.roles[0]?.id;

const MobileApp: React.FC = () => {
  const isMobile = useIsMobile();
  const { deviceId, isFirstSession } = useDevice();
  const { posts } = usePostsContext();

  const [currentView, setCurrentView] = useState<"initiation" | "main" | "loading">("loading");
  const [currentSlide, setCurrentSlide] = useState(1); // 0: Settings, 1: Home, 2: Explore
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showBusinessDetails, setShowBusinessDetails] = useState(false);
  const [previouslySelectedBusiness, setPreviouslySelectedBusiness] = useState<Business | null>(null);
  const [filteredBusinessId, setFilteredBusinessId] = useState<string | null>(null);
  const [filteredUserStories, setFilteredUserStories] = useState(false);
  const [votingRoles, setVotingRoles] = useState<Set<string>>(new Set());

  const mapRef = useRef<MapHandle>(null);
  const hasInitialized = useRef(false);

  // Touch tracking for the swipeable cards.
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isDraggingHorizontallyRef = useRef(false);
  const hasScrolledRef = useRef(false);
  const dragStartTimeRef = useRef(0);

  // ---------------------------------------------------------------- startup
  useEffect(() => {
    if (hasInitialized.current || !deviceId) return;
    hasInitialized.current = true;

    (async () => {
      try {
        const [{ data: profile }, currentJob] = await Promise.all([
          supabase.from("profiles").select("id").eq("id", deviceId).maybeSingle(),
          getCurrentJob(deviceId),
        ]);

        if (!profile) {
          const { error } = await supabase.from("profiles").insert({ id: deviceId });
          if (error) console.error("Error creating profile row:", error);
        }

        if (currentJob) {
          setCurrentView("main");
        } else {
          // Don't prompt on the very first visit; nudge on return visits instead.
          setCurrentView(isFirstSession ? "main" : "initiation");
        }
      } catch (error) {
        console.error("Error during app initialization:", error);
        setCurrentView("main");
      }
    })();
  }, [deviceId, isFirstSession]);

  // If the user returns to the home slide while the prompt is up and a job now exists, dismiss it.
  useEffect(() => {
    if (currentSlide !== 1 || currentView !== "initiation" || !deviceId) return;
    getCurrentJob(deviceId)
      .then((currentJob) => {
        if (currentJob) setCurrentView("main");
      })
      .catch((error) => console.error("Error re-checking current job:", error));
  }, [currentSlide, currentView, deviceId]);

  // ------------------------------------------------------------ job saving
  /** Save the job, attach the role/salary to the business if it exists, and post the update. */
  const persistJob = useCallback(
    async (data: UserData) => {
      const salary = parseSalaryInput(data.salary);
      const timePeriod = data.timePeriod || "HR";

      await saveCurrentJob(deviceId, {
        role: data.role,
        salary,
        location: data.location,
        business_name: data.businessName || data.location,
        time_period: timePeriod,
      });

      let businessId: string | undefined;
      try {
        const { data: existing } = await supabase.from("businesses").select("id").ilike("name", data.location).maybeSingle();
        if (existing) {
          businessId = existing.id;
          await createOrUpdateBusinessRole(data.location, data.role, data.salary);
        }
      } catch (roleError) {
        console.error("Error with business role:", roleError);
      }

      await createPost(
        `New Job Update! ${data.salary}/${timePeriod} for ${data.role} 😳`,
        "job_update",
        businessId,
        data.role,
        timePeriod,
        salary,
      );
    },
    [deviceId],
  );

  const handleInitiationComplete = useCallback(
    async (data: UserData) => {
      setCurrentView("main");
      try {
        await persistJob(data);
      } catch (error) {
        console.error("Error saving job data:", error);
      }
    },
    [persistJob],
  );

  // ------------------------------------------------------- business selection
  const handleBusinessClick = useCallback(
    async (business: Business | null) => {
      if (!business) {
        setSelectedBusiness(null);
        setFilteredBusinessId(null);
        setShowBusinessDetails(false);
        return;
      }

      setSelectedBusiness(business);
      setFilteredBusinessId(null);

      if (!hasFullDetails(business)) {
        const full = await getFullBusinessDetailsCached(business.id);
        if (full) setSelectedBusiness((current) => (current?.id === full.id ? full : current));
      }
    },
    [],
  );

  const handleBusinessStoriesClick = useCallback((businessId: string) => {
    setFilteredBusinessId(businessId);
    setFilteredUserStories(false);
    setCurrentSlide(2);
  }, []);

  const handleUserStoriesClick = useCallback(() => {
    setFilteredUserStories(true);
    setFilteredBusinessId(null);
    setCurrentSlide(2);
  }, []);

  const handleBackToAllPosts = useCallback(() => {
    setFilteredBusinessId(null);
    setFilteredUserStories(false);
  }, []);

  /** Jump from a post to its business on the map. */
  const handleFlyToBusiness = useCallback(async (businessId: string, post?: Post) => {
    setCurrentSlide(1);

    // Show something immediately if the post carries coordinates, then upgrade to full details.
    if (post?.businessLat && post?.businessLng) {
      setSelectedBusiness({
        id: businessId,
        name: post.businessName ?? "",
        position: { lat: post.businessLat, lng: post.businessLng },
        atmosphere: [],
        roles: [],
      });
      setShowBusinessDetails(true);
      mapRef.current?.flyTo(post.businessLat, post.businessLng);
    }

    const full = await getFullBusinessDetailsCached(businessId);
    if (!full) return;
    setSelectedBusiness(full);
    setShowBusinessDetails(true);
    if (full.position?.lat && full.position?.lng) mapRef.current?.flyTo(full.position.lat, full.position.lng);
  }, []);

  // ------------------------------------------------------------- role votes
  const handleRoleVote = useCallback(
    async (businessId: string, roleIndex: number, voteType: "up" | "down") => {
      const business = selectedBusiness?.id === businessId ? selectedBusiness : null;
      const role = business?.roles?.[roleIndex];
      if (!business || !role?.id) {
        toast.error("Unable to vote right now. Close and reopen the business to refresh its roles.");
        return;
      }
      const roleId = role.id;

      setVotingRoles((prev) => new Set(prev).add(roleId));

      const applyRoleVote = ({ newUserVote, newTotal }: { newUserVote: "up" | "down" | null; newTotal: number }) => {
        setSelectedBusiness((current) => {
          if (!current || current.id !== businessId || !current.roles) return current;
          const updated = {
            ...current,
            roles: current.roles.map((r, idx) => (idx === roleIndex ? { ...r, votesTotal: newTotal, userVote: newUserVote } : r)),
          };
          setCachedBusiness(updated);
          return updated;
        });
      };

      try {
        await applyOptimisticVote({
          currentUserVote: role.userVote ?? null,
          currentVotesTotal: role.votesTotal,
          voteType,
          apply: applyRoleVote,
          persist: async (newUserVote) => {
            const dbVoteType = newUserVote === "up" ? "upvote" : newUserVote === "down" ? "downvote" : null;
            const result = await persistVote("role_votes", "business_role_id", roleId, dbVoteType);
            return result.success;
          },
          onError: () => toast.error("Vote failed to save. Please try again."),
        });
      } finally {
        setVotingRoles((prev) => {
          const next = new Set(prev);
          next.delete(roleId);
          return next;
        });
      }
    },
    [selectedBusiness],
  );

  // ------------------------------------------------------------ slide state
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
  }, [currentSlide, selectedBusiness, previouslySelectedBusiness]);

  const settingsCardPosition = useMemo(() => {
    if (!isMobile) return currentSlide === 0 ? "0%" : "-100%";
    return currentSlide === 0 ? "0%" : currentSlide === 1 ? "-92.75%" : "-200%";
  }, [isMobile, currentSlide]);

  const exploreCardPosition = useMemo(() => {
    if (!isMobile) return currentSlide === 2 ? "0%" : "100%";
    return currentSlide === 2 ? "0%" : currentSlide === 1 ? "92.75%" : "200%";
  }, [isMobile, currentSlide]);

  const shouldRenderSettingsCard = isMobile || currentSlide === 0;
  const shouldRenderExploreCard = isMobile || currentSlide === 2;

  const handleSettingsPostClick = useCallback(() => setCurrentSlide(2), []);

  // ---------------------------------------------------------- swipe gestures
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    dragStartTimeRef.current = Date.now();
    isDraggingHorizontallyRef.current = false;
    hasScrolledRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartXRef.current);
    const deltaY = Math.abs(touch.clientY - touchStartYRef.current);

    // Decide intent early: mostly-horizontal means swipe, otherwise let it scroll.
    if (!isDraggingHorizontallyRef.current && !hasScrolledRef.current && (deltaX > 5 || deltaY > 5)) {
      if (deltaX > deltaY * 1.5) {
        isDraggingHorizontallyRef.current = true;
        e.preventDefault();
      } else {
        hasScrolledRef.current = true;
      }
    }
    if (isDraggingHorizontallyRef.current) e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent, cardType: "settings" | "explore") => {
      if (!isDraggingHorizontallyRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartXRef.current;
      const deltaTime = Date.now() - dragStartTimeRef.current;
      const velocity = Math.abs(deltaX) / deltaTime; // px/ms

      const DISTANCE_THRESHOLD = 30;
      const VELOCITY_THRESHOLD = 0.3;
      const isQuickSwipe = velocity > VELOCITY_THRESHOLD;
      const isLongSwipe = Math.abs(deltaX) > DISTANCE_THRESHOLD;

      if (isQuickSwipe || isLongSwipe) {
        if (cardType === "settings") {
          if (currentSlide === 0 && deltaX < -15) setCurrentSlide(1);
          else if (currentSlide === 1 && deltaX > 15) setCurrentSlide(0);
        } else {
          if (currentSlide === 2 && deltaX > 15) setCurrentSlide(1);
          else if (currentSlide === 1 && deltaX < -15) setCurrentSlide(2);
        }
      }

      isDraggingHorizontallyRef.current = false;
      hasScrolledRef.current = false;
    },
    [currentSlide],
  );

  const cardTransition = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const;

  return (
    <div className={`fixed inset-0 ${!isMobile ? "overflow-hidden" : ""}`}>
      {currentView === "loading" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <Skeleton className="w-full h-full" />
        </div>
      )}

      <Suspense fallback={<Skeleton className="w-full h-full" />}>
        <HomePage
          mapRef={mapRef}
          currentSlide={currentSlide}
          currentView={currentView === "loading" ? "main" : currentView}
          selectedBusiness={selectedBusiness}
          onBusinessSelect={handleBusinessClick}
          posts={posts}
          onBusinessStoriesClick={handleBusinessStoriesClick}
          onRoleVote={handleRoleVote}
          votingRoles={votingRoles}
          showBusinessDetails={showBusinessDetails}
          onShowBusinessDetails={() => setShowBusinessDetails(true)}
          onBackToPreview={() => setShowBusinessDetails(false)}
        />
      </Suspense>

      {shouldRenderSettingsCard && currentView !== "initiation" && (
        <motion.div
          animate={{ x: settingsCardPosition }}
          transition={cardTransition}
          className="absolute inset-0 z-20"
          style={{
            pointerEvents: currentSlide === 0 || (isMobile && currentSlide === 1) ? "auto" : "none",
            filter: currentSlide === 0 ? "none" : "brightness(0.95)",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => handleTouchEnd(e, "settings")}
        >
          <div data-scrollable className="h-full overflow-y-auto">
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <SettingsPage onStoriesClick={handleUserStoriesClick} onPostClick={handleSettingsPostClick} />
            </Suspense>
          </div>
        </motion.div>
      )}

      {shouldRenderExploreCard && currentView !== "initiation" && (
        <motion.div
          animate={{ x: exploreCardPosition }}
          transition={cardTransition}
          className="absolute inset-0 z-20"
          style={{
            pointerEvents: currentSlide === 2 || (isMobile && currentSlide === 1) ? "auto" : "none",
            filter: currentSlide === 2 ? "none" : "brightness(0.95)",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => handleTouchEnd(e, "explore")}
        >
          <div data-scrollable className="h-full">
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <ExplorePage
                currentSlide={currentSlide}
                filteredBusinessId={filteredBusinessId || undefined}
                filteredUserStories={filteredUserStories}
                onBackToAllPosts={handleBackToAllPosts}
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
              aria-label={["Settings", "Map", "Explore"][index]}
              className={`w-3 h-3 rounded-full transition-colors ${index === currentSlide ? "bg-app-yellow" : "bg-app-gray-light"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileApp;
