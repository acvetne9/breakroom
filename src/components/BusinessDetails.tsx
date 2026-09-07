import React, { memo, useRef } from "react";
import VotingComponent from "./VotingComponent";
import { formatTimeAgo } from "../utils/timeAgo";
import { TranslatedText } from "./TranslatedText";
import { sanitizeVoteTotal } from "@/utils/voteCalculations";
import type { Business } from "@/types/business";
import type { Post } from "@/services/posts";

interface BusinessDetailsProps {
  business: Business;
  posts: Post[];
  onClose: () => void;
  onBackToPreview?: () => void;
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  /** Owns the optimistic update and persistence for role votes. */
  onRoleVote?: (businessId: string, roleIndex: number, voteType: "up" | "down") => void | Promise<void>;
  /** Role ids with a vote currently in flight. */
  votingRoles?: Set<string>;
}

const BusinessDetails: React.FC<BusinessDetailsProps> = memo(
  ({ business, posts, onClose, onBackToPreview, onStoriesClick, onRoleVote, votingRoles }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleBackgroundClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    };

    const handleCompassClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const destination = business.website || `https://www.google.com/search?q=${encodeURIComponent(business.name)}`;
      window.open(destination, "_blank", "noopener");
    };

    const businessStories = posts
      .filter((post) => post.businessId === business.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const openStories = (e: React.MouseEvent) => {
      if (!onStoriesClick) return;
      e.stopPropagation();
      onStoriesClick();
    };

    const roles = business.roles ?? [];
    const shouldScroll = roles.length > 6;

    return (
      <div className="fixed inset-0 z-40 flex items-start justify-center" style={{ paddingTop: "8vh" }} onClick={handleBackgroundClick}>
        <div
          className="app-card p-6 animate-fade-in flex flex-col max-h-[80vh] relative"
          onClick={(e) => {
            e.stopPropagation();
            onBackToPreview?.();
          }}
        >
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2">
            <div className="flex justify-between items-start mb-2">
              <div>
                <TranslatedText text={business.name} className="text-xl font-medium text-app-black" />
                {(business.address?.trim() || business.atmosphere?.length > 0) && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {business.address && <span className="text-sm text-app-gray-medium">{business.address}</span>}
                    {business.atmosphere?.length > 0 && (
                      <span className="text-sm text-app-gray-medium">{business.atmosphere.join(" • ")}</span>
                    )}
                  </div>
                )}
              </div>

              <button onClick={handleCompassClick} className="compass-button p-2 rounded-lg bg-gray-100/0 py-0" aria-label="Open website">
                <span className="text-3xl">🧭</span>
              </button>
            </div>

            <div className="mb-2">
              <h3 className="text-lg font-medium text-app-black mb-2">Roles & Salaries</h3>

              <div
                className={`space-y-2 ${shouldScroll ? "max-h-64 overflow-y-auto pr-2" : ""}`}
                style={shouldScroll ? { scrollbarWidth: "thin" } : undefined}
              >
                {roles.map((role, index) => (
                  <div key={role.id ?? index} className="flex justify-between items-center py-1">
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
                        onVote={(voteType) => onRoleVote?.(business.id, index, voteType)}
                        isVoting={!!role.id && !!votingRoles?.has(role.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-2">
                <span className="text-xs text-app-gray-medium">Do these seem right?</span>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-app-black mb-3">More Stories 📖</h3>

              <div className="space-y-4">
                {businessStories.length > 0 ? (
                  <>
                    {businessStories.slice(0, 5).map((story) => (
                      <div
                        key={story.id}
                        className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded relative"
                        onClick={openStories}
                      >
                        <TranslatedText
                          text={story.text.length > 100 ? `${story.text.substring(0, 100)}...` : story.text}
                          className="text-app-gray-dark text-sm pb-4"
                        />
                        <span className="absolute bottom-2 left-4 text-xs text-gray-400">{formatTimeAgo(story.createdAt)}</span>
                      </div>
                    ))}

                    {businessStories.length > 5 && (
                      <button
                        onClick={openStories}
                        className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                      >
                        View all Stories ({businessStories.length})
                      </button>
                    )}
                  </>
                ) : (
                  <div
                    className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
                    onClick={openStories}
                  >
                    <p className="text-app-gray-dark text-sm font-medium">Be the first to post! 🚀</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

BusinessDetails.displayName = "BusinessDetails";

export default BusinessDetails;
