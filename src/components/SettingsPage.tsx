import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Plus, Minus } from "lucide-react";
import JobEditor, { JobSyncIndicator } from "./JobEditor";
import { useDevice } from "@/contexts/DeviceContext";
import { usePostsContext } from "./PostsProvider";
import { getPastJobs, savePastJob, deletePastJob } from "@/services/pastJobs";
import { getCurrentJob, saveCurrentJob } from "@/services/currentJobs";
import {
  CURRENT_JOB_ID,
  emptyJobForm,
  isJobFormComplete,
  isTempId,
  jobFormFromRecord,
  newTempId,
  toJobRecord,
  type JobFormState,
} from "@/utils/jobForm";
import type { Post } from "@/services/posts";

interface SettingsPageProps {
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onSearchTrigger?: (searchTerm: string) => void;
}

const AUTO_SAVE_DELAY_MS = 1000;

/**
 * Current job + past jobs with debounced auto-save, plus the user's stories.
 * Both job kinds share one state shape (`JobFormState`) and one editor; the
 * only difference is which service persists them.
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ onStoriesClick, onPostClick }) => {
  const { deviceId } = useDevice();
  const { getUserPostsAndCommented } = usePostsContext();

  const [currentJob, setCurrentJob] = useState<JobFormState | null>(null);
  const [pastJobs, setPastJobs] = useState<JobFormState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // One debounce timer per job so editing one past job never cancels another's save.
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Latest state for the timers to read.
  const currentJobRef = useRef(currentJob);
  const pastJobsRef = useRef(pastJobs);
  currentJobRef.current = currentJob;
  pastJobsRef.current = pastJobs;

  const userPosts = useMemo(() => (isStoriesExpanded ? getUserPostsAndCommented() : []), [isStoriesExpanded, getUserPostsAndCommented]);

  // ------------------------------------------------------------------ load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [currentRecord, pastRecords] = await Promise.all([getCurrentJob(deviceId), getPastJobs(deviceId)]);
        if (cancelled) return;

        setCurrentJob(currentRecord ? jobFormFromRecord(CURRENT_JOB_ID, currentRecord) : emptyJobForm(CURRENT_JOB_ID));

        const complete = pastRecords.filter((job) => job.role && job.salary > 0 && job.location && job.time_period);
        setPastJobs(complete.length > 0 ? complete.map((job) => jobFormFromRecord(job.id!, job)) : [emptyJobForm(newTempId())]);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load jobs:", error);
        setLoadError(error instanceof Error ? error.message : "Failed to load jobs");
        setCurrentJob(emptyJobForm(CURRENT_JOB_ID));
        setPastJobs([emptyJobForm(newTempId())]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // ------------------------------------------------------------------ save
  const patchJob = useCallback((id: string, patch: Partial<JobFormState>) => {
    if (id === CURRENT_JOB_ID) {
      setCurrentJob((prev) => (prev ? { ...prev, ...patch } : prev));
    } else {
      setPastJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    }
  }, []);

  const saveJob = useCallback(
    async (id: string) => {
      const job = id === CURRENT_JOB_ID ? currentJobRef.current : pastJobsRef.current.find((j) => j.id === id);
      if (!job || !isJobFormComplete(job)) return;

      patchJob(id, { isSaving: true, hasError: false });
      try {
        let savedId = id;
        if (id === CURRENT_JOB_ID) {
          await saveCurrentJob(deviceId, toJobRecord(job));
        } else {
          savedId = await savePastJob(deviceId, { ...toJobRecord(job), id: isTempId(id) ? undefined : id });
        }
        patchJob(id, { id: savedId, isDirty: false, isSaving: false, hasError: false, errorMessage: undefined, lastSavedAt: new Date() });
      } catch (error) {
        console.error("Failed to save job:", error);
        patchJob(id, { isSaving: false, hasError: true, errorMessage: error instanceof Error ? error.message : "Failed to save" });
      }
    },
    [deviceId, patchJob],
  );

  const scheduleSave = useCallback(
    (id: string) => {
      const timers = saveTimersRef.current;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          saveJob(id);
        }, AUTO_SAVE_DELAY_MS),
      );
    },
    [saveJob],
  );

  /** Apply an editor transition and queue a save if it made the job dirty. */
  const updateJob = useCallback(
    (id: string, transition: (job: JobFormState) => JobFormState) => {
      let becameDirty = false;
      const run = (job: JobFormState) => {
        const next = transition(job);
        if (next !== job && next.isDirty) becameDirty = true;
        return next;
      };
      if (id === CURRENT_JOB_ID) {
        setCurrentJob((prev) => (prev ? run(prev) : prev));
      } else {
        setPastJobs((prev) => prev.map((j) => (j.id === id ? run(j) : j)));
      }
      // State updaters run synchronously in React 18 event handlers, so this is settled here.
      if (becameDirty) scheduleSave(id);
    },
    [scheduleSave],
  );

  const addPastJob = () => setPastJobs((prev) => [...prev, emptyJobForm(newTempId())]);

  const removePastJob = useCallback(
    async (id: string) => {
      const timer = saveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(id);
      setPastJobs((prev) => prev.filter((j) => j.id !== id));
      if (!isTempId(id)) {
        try {
          await deletePastJob(deviceId, id);
        } catch (error) {
          console.error("Failed to delete past job:", error);
        }
      }
    },
    [deviceId],
  );

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!showHelpPopup) return;
    const close = () => setShowHelpPopup(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showHelpPopup]);

  // ---------------------------------------------------------------- render
  if (isLoading) return null;

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <div className="app-card p-6 text-center">
          <p className="text-app-black font-medium">
            Error: Unable to load job data, please check your internet connection and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
      <div ref={scrollContainerRef} className="app-card p-6 animate-fade-in flex flex-col max-h-[80vh] overflow-y-auto relative">
        <div className="flex-1 overflow-y-auto pr-2">
          <h1 className="text-xl font-medium text-app-black mb-2">Welcome to workaround! 😊</h1>

          <p className="text-xl text-app-black mb-2">
            <span className="font-medium">Tip:</span>{" "}
            <span className="font-light opacity-70">Use the search bar on the map to search businesses by keyword, roles, and pay.</span>
          </p>

          {currentJob && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-app-black">Current Job</h2>
                <JobSyncIndicator job={currentJob} />
              </div>
              <JobEditor
                job={currentJob}
                onChange={(t) => updateJob(CURRENT_JOB_ID, t)}
                businessPlaceholder="Where do you work?..."
                salaryPlaceholder="$14.00"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
              <button onClick={addPastJob} aria-label="Add past job" className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
                <Plus className="w-4 h-4 text-app-black" />
              </button>
            </div>

            <div className="space-y-4">
              {pastJobs.map((job) => (
                <div key={job.id} className="space-y-3 w-full relative">
                  <div className="absolute -left-8 top-0 flex items-center gap-1">
                    <JobSyncIndicator job={job} size="sm" />
                  </div>
                  <JobEditor
                    job={job}
                    onChange={(t) => updateJob(job.id, t)}
                    businessPlaceholder="Where did you work?..."
                    salaryPlaceholder="$17.00"
                    trailing={
                      <button
                        onClick={() => removePastJob(job.id)}
                        aria-label="Remove past job"
                        className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
                      >
                        <Minus className="w-4 h-4 text-app-black" />
                      </button>
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <button onClick={() => setIsStoriesExpanded((v) => !v)} className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity">
              <h3 className="text-lg font-medium text-app-black">My Stories 📖</h3>
              <span className="text-sm text-app-gray-medium">{isStoriesExpanded ? "▼" : "▶"}</span>
            </button>
            {isStoriesExpanded && (
              <div className="mt-4 space-y-2">
                {userPosts.length === 0 ? (
                  <p className="text-app-gray-medium text-sm">No stories or comments yet. Share your workplace experiences!</p>
                ) : (
                  userPosts.slice(0, 3).map((post) => (
                    <div
                      key={post.id}
                      className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
                      onClick={() => {
                        onPostClick?.(post);
                        onStoriesClick?.();
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs text-app-gray-medium">{post.author === "You" ? "Your story" : "Commented on"}</p>
                        {post.businessName && <span className="text-xs text-app-gray-medium">at {post.businessName}</span>}
                      </div>
                      <p className="text-app-gray-dark text-sm">{post.text.length > 100 ? `${post.text.substring(0, 100)}...` : post.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-start relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHelpPopup((v) => !v);
                setTimeout(() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" }), 100);
              }}
              aria-label="About this data"
              className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
            >
              ?
            </button>
          </div>

          {showHelpPopup && (
            <div className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-app-gray-dark">
                <strong>Disclaimer:</strong> The information presented in this app is based on surveys, user input, and publicly
                available sources. We do not independently verify all information, and it should not be taken as factual statements
                about any individual or organization.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
