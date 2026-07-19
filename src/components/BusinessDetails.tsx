import React, { memo, useRef, useState } from "react";
import { Compass } from "lucide-react";
import VotingComponent from "./VotingComponent";
import { formatTimeAgo } from "../utils/timeAgo";
import { TranslatedText } from "./TranslatedText";
import { calculateVoteChange, sanitizeVoteTotal } from "@/utils/voteCalculations";
import { applyOptimisticVote } from "@/hooks/useOptimisticVote";

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
    address?: string;
    stories?: Array<{
      id: string;
      text: string;
      author: string;
    }>;
    roles?: Array<{
      id?: string;
      role: string;
      salary: string;
      votesTotal?: number;
      userVote?: "up" | "down" | null;
    }>;
    website?: string;
    url?: string;
  };
  posts: Post[];
  onClose: () => void;
  onBackToPreview?: () => void;
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onRoleVote?: (businessId: string, roleIndex: number, voteType: "up" | "down") => void | Promise<void>;
  votingRoles?: Set<string>;
}

const BusinessDetails: React.FC<BusinessDetailsProps> = memo(
  ({
    business,
    posts,
    onClose,
    onBackToPreview,
    onStoriesClick,
    onPostClick,
    onRoleVote,
    votingRoles: externalVotingRoles,
  }) => {
    const [showHelpPopup, setShowHelpPopup] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Internal voting state management
    const [internalVotingRoles, setInternalVotingRoles] = useState<Set<string>>(new Set());
    const [localRoles, setLocalRoles] = useState(business.roles || []);

    // Use external voting state if provided, otherwise use internal
    const votingRoles = externalVotingRoles || internalVotingRoles;

    const handleBackgroundClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    };

    const handleCompassClick = (e: React.MouseEvent) => {
      e.stopPropagation();

      const destination =
        business.website || business.url || `https://www.google.com/search?q=${encodeURIComponent(business.name)}`;

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
            behavior: "smooth",
          });
        }
      }, 100);
    };

    const businessStories = Array.isArray(posts)
      ? posts.filter((post) => post.businessId === business.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : [];

    const handleCardClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onBackToPreview?.();
    };

    const handleStoryClick = (post: Post, e: React.MouseEvent) => {
      e.stopPropagation();
      onPostClick?.(post);
    };

    const handleRoleVote = async (roleIndex: number, voteType: "up" | "down", e?: React.MouseEvent) => {
      e?.stopPropagation();

      const voteKey = `${business.id}-${roleIndex}`;

      // Start loading state
      if (!externalVotingRoles) {
        setInternalVotingRoles((prev) => new Set(prev).add(voteKey));
      }

      // Read the current role to seed the optimistic calculation.
      const currentRole = localRoles[roleIndex];

      // Optimistically update UI. Reads the freshest role inside the updater so
      // concurrent state stays consistent. Shared between the optimistic write
      // and (unused here) rollback path of the primitive.
      const applyRole = ({
        newUserVote,
        newTotal,
      }: {
        newUserVote: "up" | "down" | null;
        newTotal: number;
      }) => {
        setLocalRoles((prevRoles) => {
          const newRoles = [...prevRoles];
          const role = newRoles[roleIndex];
          if (role) {
            newRoles[roleIndex] = {
              ...role,
              votesTotal: newTotal,
              userVote: newUserVote,
            };
          }
          return newRoles;
        });
      };

      // Call parent handler if provided
      if (onRoleVote) {
        try {
          await applyOptimisticVote({
            currentUserVote: currentRole?.userVote ?? null,
            currentVotesTotal: sanitizeVoteTotal(currentRole?.votesTotal),
            voteType,
            apply: applyRole,
            // Persistence is delegated to the parent handler, not persistVote.
            persist: async () => {
              await onRoleVote(business.id, roleIndex, voteType);
              return true;
            },
            // Specialized rollback: revert the whole roles array to props
            // (matches the previous behavior exactly).
            onError: (error) => {
              console.error("Vote failed:", error);
              setLocalRoles(business.roles || []);
            },
          });
        } finally {
          // Stop loading state
          if (!externalVotingRoles) {
            setInternalVotingRoles((prev) => {
              const next = new Set(prev);
              next.delete(voteKey);
              return next;
            });
          }
        }
      } else {
        // No parent handler: apply the optimistic update locally (no persistence,
        // no rollback), then stop loading after a short delay.
        applyRole(calculateVoteChange(currentRole?.userVote ?? null, voteType, sanitizeVoteTotal(currentRole?.votesTotal)));

        if (!externalVotingRoles) {
          setTimeout(() => {
            setInternalVotingRoles((prev) => {
              const next = new Set(prev);
              next.delete(voteKey);
              return next;
            });
          }, 500);
        }
      }
    };

    // Use local roles if we're managing state internally, otherwise use business.roles
    const displayRoles = externalVotingRoles ? business.roles || [] : localRoles;
    const shouldScroll = displayRoles.length > 6;

    return (
      <div
        className="fixed inset-0 z-40 flex items-start justify-center"
        style={{ paddingTop: "8vh" }}
        onClick={handleBackgroundClick}
      >
        <div className="app-card p-6 animate-fade-in flex flex-col max-h-[80vh] relative" onClick={handleCardClick}>
          {/* Scrollable content area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2">
            <div className="flex justify-between items-start mb-2">
              <div>
                <TranslatedText text={business.name} className="text-xl font-medium text-app-black" />

                {(business.address?.trim() ||
                  (Array.isArray(business.atmosphere) && business.atmosphere.length > 0)) && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {business.address && <span className="text-sm text-app-gray-medium">{business.address}</span>}
                    {Array.isArray(business.atmosphere) && business.atmosphere.length > 0 && (
                      <span className="text-sm text-app-gray-medium">{business.atmosphere.join(" • ")}</span>
                    )}
                  </div>
                )}
              </div>

              <button onClick={handleCompassClick} className="compass-button p-2 rounded-lg bg-gray-100/0 py-0">
                <span className="text-3xl">🧭</span>
              </button>
            </div>

            {/* Job roles and salaries */}
            <div className="mb-2">
              <h3 className="text-lg font-medium text-app-black mb-2">Roles & Salaries</h3>

              <div
                className={`space-y-2 ${shouldScroll ? "max-h-64 overflow-y-auto pr-2" : ""}`}
                style={shouldScroll ? { scrollbarWidth: "thin" } : undefined}
              >
                {displayRoles.map((role, index) => (
                  <div key={index} className="flex justify-between items-center py-1">
                    <span className="text-app-black">{role.role}</span>

                    <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                      <span className="font-medium text-app-black">
                        {typeof role.salary === "string" ? role.salary : "$13.6"}
                        {!(typeof role.salary === "string" && role.salary.includes("/")) && (
                          <span className="text-xs text-app-gray-medium ml-1">/hr</span>
                        )}
                      </span>

                      <VotingComponent
                        votesTotal={sanitizeVoteTotal(role.votesTotal)}
                        userVote={role.userVote}
                        onVote={(voteType) => handleRoleVote(index, voteType)}
                        isVoting={votingRoles.has(`${business.id}-${index}`)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-2">
                <span className="text-xs text-app-gray-medium">Do these seem right?</span>
              </div>
            </div>

            {/* Stories section */}
            <div>
              <h3 className="text-lg font-medium text-app-black mb-3">More Stories 📖</h3>

              <div className="space-y-4">
                {Array.isArray(businessStories) && businessStories.length > 0 ? (
                  <>
                    {businessStories.slice(0, 5).map((story) => (
                      <div
                        key={story.id}
                        className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded relative"
                        onClick={(e) => {
                          if (onStoriesClick) {
                            e.stopPropagation();
                            onStoriesClick();
                          }
                        }}
                      >
                        <TranslatedText
                          text={
                            story.text && story.text.length > 100
                              ? `${story.text.substring(0, 100)}...`
                              : story.text || ""
                          }
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
                          if (onStoriesClick) {
                            e.stopPropagation();
                            onStoriesClick();
                          }
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
                      if (onStoriesClick) {
                        e.stopPropagation();
                        onStoriesClick();
                      }
                    }}
                  >
                    <p className="text-app-gray-dark text-sm font-medium">Be the first to post! 🚀</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center shrink-0">
            <button
              onClick={handleHelpButtonClick}
              className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-white font-bold text-sm"
            >
              ?
            </button>
            <p className="text-xs text-app-gray-medium ml-4">Is this business accurate?</p>
          </div>

          {/* Help Popup - Styled like other cards with rounded edges */}
          {showHelpPopup && (
            <div
              className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Condensed input fields */}
              <input type="text" placeholder="Business name..." className="app-input w-full h-10 text-sm" />
              <input type="text" placeholder="Job role..." className="app-input w-full h-10 text-sm" />
              <input type="text" placeholder="Salary..." className="app-input w-full h-10 text-sm" />

              {/* Footer row with checkbox + submit */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center text-xs text-app-gray-dark">
                  <input type="checkbox" className="mr-2" />
                  Did this business close?
                </label>
                <button className="px-3 py-1 bg-app-yellow text-app-black rounded text-xs hover:bg-app-yellow/90 transition-colors">
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default BusinessDetails;
