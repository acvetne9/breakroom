import React, { memo, useMemo } from "react";
import { formatTimeAgo } from "../utils/timeAgo";
import type { Business } from "@/types/business";
import type { Post } from "@/services/posts";

interface BusinessPreviewProps {
  business: Business;
  posts: Post[];
  onClose: () => void;
  onShowDetails: () => void;
  onStoriesClick: () => void;
}

/** Average salary per role name, parsed from the free-text salary strings. */
const averageByRole = (roles: Business["roles"]) => {
  const groups: Record<string, number[]> = {};
  for (const role of roles ?? []) {
    const match = (typeof role.salary === "string" ? role.salary : "").match(/\$?(\d+(?:\.\d+)?)/);
    const salary = match ? parseFloat(match[1]) : 0;
    if (salary > 0) (groups[role.role] ??= []).push(salary);
  }
  return Object.entries(groups).map(([role, salaries]) => ({
    role,
    averageSalary: `$${(salaries.reduce((sum, s) => sum + s, 0) / salaries.length).toFixed(1)}`,
    count: salaries.length,
  }));
};

const BusinessPreview: React.FC<BusinessPreviewProps> = memo(({ business, posts, onClose, onShowDetails, onStoriesClick }) => {
  const businessStories = posts.filter((post) => post.businessId === business.id && post.isStory).slice(0, 3);
  const roleAverages = useMemo(() => averageByRole(business.roles), [business.roles]);

  const handleStoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStoriesClick();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center"
      style={{ paddingTop: "25vh" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Yellow circle for selected pin */}
      <div
        className="absolute w-6 h-6 bg-app-yellow rounded-full opacity-50 animate-scale-in"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      <div className="app-popup p-6 cursor-pointer relative animate-fade-in" onClick={(e) => !e.defaultPrevented && onShowDetails()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-app-black">{business.name}</h3>
            {business.atmosphere?.length > 0 && (
              <div className="flex items-center mt-1">
                <span className="text-app-gray-medium text-sm">{business.atmosphere.join(" • ")}</span>
              </div>
            )}
          </div>
        </div>

        {roleAverages.length > 0 && (
          <div className="mb-4">
            <div
              className="space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
              style={{ maxHeight: roleAverages.length > 3 ? "72px" : "auto" }}
            >
              {roleAverages.map((roleAvg) => (
                <div key={roleAvg.role} className="flex justify-between items-center h-6 flex-shrink-0">
                  <span className="text-app-black text-sm">{roleAvg.role}</span>
                  <span className="font-medium text-app-black text-sm">
                    {roleAvg.averageSalary}
                    <span className="text-xs text-app-gray-medium ml-1">/hr</span>
                    {roleAvg.count > 1 && <span className="text-xs text-app-gray-medium ml-1">({roleAvg.count})</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-app-black">Stories 📖</h4>
          </div>
          <div className="space-y-2">
            {businessStories.length > 0 ? (
              businessStories.map((story) => (
                <div
                  key={story.id}
                  className="text-sm text-app-gray-dark cursor-pointer hover:text-app-black relative pb-4"
                  onClick={handleStoryClick}
                >
                  <p className="line-clamp-2">{story.text.length > 60 ? `${story.text.substring(0, 60)}...` : story.text}</p>
                  <span className="absolute bottom-0 left-0 text-xs text-gray-400">{formatTimeAgo(story.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-app-gray-medium cursor-pointer hover:text-app-black font-medium" onClick={handleStoryClick}>
                <p>Be the first to post! 🚀</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

BusinessPreview.displayName = "BusinessPreview";

export default BusinessPreview;
