import React, { memo, useRef, useState } from "react";
import { toast } from "sonner";
import VotingComponent from "./VotingComponent";
import { RoleField, SalaryTimePeriodRow } from "./JobEntryForm";
import { formatTimeAgo } from "../utils/timeAgo";
import { TranslatedText } from "./TranslatedText";
import { sanitizeVoteTotal } from "@/utils/voteCalculations";
import { formatSalaryDisplay, sanitizeSalaryInput } from "@/utils/salaryFormat";
import { isProfane } from "@/utils/profanityFilter";
import { addBusinessRole } from "@/services/businesses";
import { submitBusinessReport, ISSUE_LABELS, type BusinessIssueType } from "@/services/reports";
import { describeDbError } from "@/services/errors";
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
  /** A role was added from the card; the parent should refetch details. */
  onRoleAdded?: (businessId: string) => void;
}

type FeedbackMode = "role" | "report";

const TIME_PERIOD_STYLE: React.CSSProperties = {
  border: "2px solid hsl(var(--app-gray-light))",
  borderRadius: "0.5rem",
  height: "40px",
  fontSize: "14px",
};

/**
 * Inline "Is this business accurate?" panel: either contribute a role + pay
 * (written straight to business_roles) or report a problem with the listing
 * (written to business_reports for review).
 */
const FeedbackPanel: React.FC<{ business: Business; onRoleAdded?: (id: string) => void; onDone: () => void }> = ({ business, onRoleAdded, onDone }) => {
  const [mode, setMode] = useState<FeedbackMode>("report");
  const [issueType, setIssueType] = useState<BusinessIssueType>("closed");
  const [details, setDetails] = useState("");
  const [suggestedName, setSuggestedName] = useState("");
  const [suggestedAddress, setSuggestedAddress] = useState("");
  const [role, setRole] = useState("");
  const [salary, setSalary] = useState(0);
  const [salaryDisplay, setSalaryDisplay] = useState("");
  const [timePeriod, setTimePeriod] = useState("HR");
  const [submitting, setSubmitting] = useState(false);

  const canSubmitRole = role.trim().length > 0 && salary > 0;
  const canSubmitReport =
    issueType === "wrong_details" ? !!(suggestedName.trim() || suggestedAddress.trim() || details.trim()) : issueType !== "other" || !!details.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if ([role, details, suggestedName, suggestedAddress].some((t) => t && isProfane(t))) {
      toast.error("Please remove inappropriate language.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "role") {
        await addBusinessRole(business.id, role.trim(), salary.toFixed(2), timePeriod);
        toast.success(`Added ${role.trim()} at ${formatSalaryDisplay(salary)}/${timePeriod}`);
        onRoleAdded?.(business.id);
      } else {
        const result = await submitBusinessReport({ businessId: business.id, issueType, details, suggestedName, suggestedAddress });
        if (!result.ok) {
          toast.error(result.reason);
          return;
        }
        toast.success("Thanks, we'll take a look.");
      }
      onDone();
    } catch (error) {
      toast.error(describeDbError(error, "Couldn't save that. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const tab = (value: FeedbackMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`flex-1 text-xs py-1.5 rounded ${mode === value ? "bg-app-yellow text-app-black" : "bg-app-gray-light/60 text-app-gray-dark"}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        {tab("report", "Report a problem")}
        {tab("role", "Add a role & pay")}
      </div>

      {mode === "role" ? (
        <>
          <RoleField value={role} onChange={setRole} placeholder="Job role..." className="app-input w-full h-10 text-sm" />
          <SalaryTimePeriodRow
            salaryValue={salaryDisplay}
            onSalaryChange={(e) => {
              const v = sanitizeSalaryInput(e.target.value);
              setSalary(parseFloat(v) || 0);
              setSalaryDisplay(v ? `$${v}` : "");
            }}
            onSalaryBlur={() => salary > 0 && setSalaryDisplay(formatSalaryDisplay(salary))}
            salaryPlaceholder="$18.00"
            salaryClassName="app-input flex-1 h-10 text-sm"
            timePeriodValue={timePeriod}
            onTimePeriodChange={setTimePeriod}
            timePeriodClassName="px-3 bg-white text-sm"
            timePeriodStyle={TIME_PERIOD_STYLE}
            rowClassName="flex items-center space-x-2"
          />
        </>
      ) : (
        <>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value as BusinessIssueType)}
            className="app-input w-full h-10 text-sm bg-white"
            aria-label="What's wrong?"
          >
            {(Object.keys(ISSUE_LABELS) as BusinessIssueType[]).map((k) => (
              <option key={k} value={k}>
                {ISSUE_LABELS[k]}
              </option>
            ))}
          </select>
          {issueType === "wrong_details" && (
            <>
              <input
                type="text"
                value={suggestedName}
                onChange={(e) => setSuggestedName(e.target.value)}
                placeholder="Correct name (optional)"
                className="app-input w-full h-10 text-sm"
              />
              <input
                type="text"
                value={suggestedAddress}
                onChange={(e) => setSuggestedAddress(e.target.value)}
                placeholder="Correct address (optional)"
                className="app-input w-full h-10 text-sm"
              />
            </>
          )}
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 500))}
            placeholder={issueType === "other" ? "Tell us what's wrong" : "Anything else? (optional)"}
            rows={2}
            className="app-input w-full text-sm py-2"
          />
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onDone} className="text-xs text-app-gray-medium hover:text-app-gray-dark">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || (mode === "role" ? !canSubmitRole : !canSubmitReport)}
          className="px-3 py-1 bg-app-yellow text-app-black rounded text-xs hover:bg-app-yellow/90 transition-colors disabled:opacity-40"
        >
          {submitting ? "Sending…" : mode === "role" ? "Add role" : "Send report"}
        </button>
      </div>
    </form>
  );
};

const BusinessDetails: React.FC<BusinessDetailsProps> = memo(
  ({ business, posts, onClose, onBackToPreview, onStoriesClick, onRoleVote, votingRoles, onRoleAdded }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showFeedback, setShowFeedback] = useState(false);

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

    const toggleFeedback = (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowFeedback((v) => !v);
      setTimeout(() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" }), 100);
    };

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

              {roles.length === 0 ? (
                <p className="text-sm text-app-gray-medium">No roles yet. Know what this place pays? Add one below.</p>
              ) : (
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
              )}

              {roles.length > 0 && (
                <div className="flex justify-end mt-2">
                  <span className="text-xs text-app-gray-medium">Do these seem right?</span>
                </div>
              )}
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

            {showFeedback && <FeedbackPanel business={business} onRoleAdded={onRoleAdded} onDone={() => setShowFeedback(false)} />}
          </div>

          <div className="pt-4 flex items-center shrink-0">
            <button
              onClick={toggleFeedback}
              aria-label="Is this business accurate?"
              aria-expanded={showFeedback}
              className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
            >
              ?
            </button>
            <p className="text-xs text-app-gray-medium ml-4">Is this business accurate?</p>
          </div>
        </div>
      </div>
    );
  },
);

BusinessDetails.displayName = "BusinessDetails";

export default BusinessDetails;
