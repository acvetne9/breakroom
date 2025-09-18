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

const MobileApp: React.FC = () => {
  const isMobile = useIsMobile();
  const [currentView, setCurrentView] = useState<'initiation' | 'main'>('initiation');
  const [currentSlide, setCurrentSlide] = useState(1);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [postId: string]: string[] }>({});
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [previouslySelectedBusiness, setPreviouslySelectedBusiness] = useState<any>(null);
  const [filteredBusinessId, setFilteredBusinessId] = useState<string | null>(null);
  const [filteredUserStories, setFilteredUserStories] = useState(false);

  const { businesses, setBusinesses, fetchFullBusinessDetails } = useBusinessesData();

  /** 🔹 Business click → update selected + fetch details if needed */
  const handleBusinessClick = async (business: any) => {
    if (!business) {
      setSelectedBusiness(null);
      setFilteredBusinessId(null);
      return;
    }

    if (!business.atmosphere?.length && !business.roles?.length) {
      const fullBusiness = await fetchFullBusinessDetails(business.id);
      if (fullBusiness) {
        setSelectedBusiness(fullBusiness);
        setFilteredBusinessId(null);
      }
    } else {
      setSelectedBusiness(business);
      setFilteredBusinessId(null);
    }
  };

  /** 🔹 When role vote happens */
  const handleRoleVote = async (businessId: string, roleIndex: number, voteType: 'up' | 'down') => {
    let business = businesses.find(b => b.id === businessId);

    if (!business?.roles?.[roleIndex]?.id) {
      const fullBusiness = await fetchFullBusinessDetails(businessId);
      if (fullBusiness?.roles?.[roleIndex]?.id) {
        setBusinesses(prev => prev.map(b => (b.id === businessId ? fullBusiness : b)));
        business = fullBusiness;
      } else {
        return;
      }
    }

    const roleId = business.roles[roleIndex].id;

    // Optimistic UI update
    setBusinesses(prev =>
      prev.map(b =>
        b.id === businessId
          ? {
              ...b,
              roles: b.roles?.map((role, idx) =>
                idx === roleIndex
                  ? {
                      ...role,
                      upvotes:
                        voteType === 'up'
                          ? role.userVote === 'up'
                            ? role.upvotes - 1
                            : role.upvotes + 1
                          : role.userVote === 'up'
                          ? role.upvotes - 1
                          : role.upvotes,
                      downvotes:
                        voteType === 'down'
                          ? role.userVote === 'down'
                            ? role.downvotes - 1
                            : role.downvotes + 1
                          : role.userVote === 'down'
                          ? role.downvotes - 1
                          : role.downvotes,
                      userVote:
                        role.userVote === voteType ? null : voteType
                    }
                  : role
              )
            }
          : b
      )
    );

    await handleRoleVoteService(businessId, roleId, voteType);
  };

  /** 🔹 Keep `selectedBusiness` fresh when businesses update */
  useEffect(() => {
    if (selectedBusiness) {
      const updated = businesses.find(b => b.id === selectedBusiness.id);
      if (updated) setSelectedBusiness(updated);
    }
  }, [businesses, selectedBusiness?.id]);

  /** 🔹 Handle slide navigation + restore previous business */
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

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map + HomePage */}
      <Suspense fallback={<Skeleton className="w-full h-full" />}>
        <HomePage
          currentSlide={currentSlide}
          currentView={currentView}
          selectedBusiness={selectedBusiness}
          onBusinessSelect={handleBusinessClick}
          onBusinessStoriesClick={(businessId) => {
            setFilteredBusinessId(businessId);
            setCurrentSlide(2);
          }}
          onPostClick={(post) => setExpandedPost(post.id)}
          onRoleVote={handleRoleVote}
        />
      </Suspense>

      {/* Explore */}
      {currentSlide === 2 && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute inset-0 z-20"
        >
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <ExplorePage
              filteredBusinessId={filteredBusinessId || undefined}
              filteredUserStories={filteredUserStories}
              onBusinessView={async (businessId) => {
                const business = businesses.find(b => b.id === businessId);
                if (business) {
                  setSelectedBusiness(business);
                  setCurrentSlide(1);
                } else {
                  const full = await fetchFullBusinessDetails(businessId);
                  if (full) {
                    setSelectedBusiness(full);
                    setCurrentSlide(1);
                  }
                }
              }}
              onExpandedPostChange={setExpandedPost}
              onCommentSubmit={(postId, comment) =>
                setComments(prev => ({
                  ...prev,
                  [postId]: [...(prev[postId] || []), comment]
                }))
              }
              onBackToAllPosts={() => {
                setFilteredBusinessId(null);
                setFilteredUserStories(false);
              }}
            />
          </Suspense>
        </motion.div>
      )}

      {/* Desktop slide indicators */}
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
