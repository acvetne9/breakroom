import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Minus, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import JobEditor, { JobSyncIndicator } from "./JobEditor";
import MyStories from "./MyStories";
import { useDevice } from "@/contexts/DeviceContext";
import { getPastJobs, savePastJob, hidePastJob, wipePastJobs, isCompletePastJob } from "@/services/pastJobs";
import { getCurrentJob, saveCurrentJob, moveCurrentJobToPast } from "@/services/currentJobs";
import {
  CURRENT_JOB_ID,
  emptyJobForm,
  isJobFormComplete,
  isTempId,
  jobFormFromRecord,
  jobFormHasContent,
  newTempId,
  toJobRecord,
  type JobFormState,
  type JobRecord,
} from "@/utils/jobForm";
import type { Post } from "@/services/posts";

interface SettingsPageProps {
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
}

const AUTO_SAVE_DELAY_MS = 1000;

/**
 * Current job (editable, retirable), past jobs (add / hide), and the user's own posts.
 *
 * Persistence rules:
 * - A job saves automatically once it is complete; an incomplete one shows a badge and is not saved.
 * - Hiding a complete past job sets `deleted_at`; the row stays in the database.
 * - Incomplete past-job rows are junk and are wiped (hard-deleted) on load and on remove.
 * - "Move to past jobs" copies the current job into past_jobs and clears it, atomically.
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ onStoriesClick, onPostClick }) => {
  const { deviceId } = useDevice();

  const [currentJob, setCurrentJob] = useState<JobFormState | null>(null);
  const [pastJobs, setPastJobs] = useState<JobFormState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  /** Set when the user switched the current job to a different business; offers to keep the old one. */
  const [previousJobOffer, setPreviousJobOffer] = useState<JobRecord | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const currentJobRef = useRef(currentJob);
  const pastJobsRef = useRef(pastJobs);
  currentJobRef.current = currentJob;
  pastJobsRef.current = pastJobs;
  /** The last complete current job we know is in the database. */
  const savedCurrentRef = useRef<JobRecord | null>(null);

  // ------------------------------------------------------------------ load
  const loadJobs = useCallback(async () => {
    setLoadError(null);
    try {
      const [currentRecord, pastRecords] = await Promise.all([getCurrentJob(deviceId), getPastJobs(deviceId)]);

      setCurrentJob(currentRecord ? jobFormFromRecord(CURRENT_JOB_ID, currentRecord) : emptyJobForm(CURRENT_JOB_ID));
      savedCurrentRef.current = currentRecord && isCompletePastJob(currentRecord) ? currentRecord : null;

      // Drafts that never became real jobs are junk: wipe them rather than show or keep them.
      const complete = pastRecords.filter(isCompletePastJob);
      const junkIds = pastRecords.filter((j) => !isCompletePastJob(j)).map((j) => j.id!);
      if (junkIds.length > 0) wipePastJobs(deviceId, junkIds).catch((e) => console.warn("Could not wipe incomplete past jobs:", e));

      setPastJobs(complete.map((job) => jobFormFromRecord(job.id!, job)));
    } catch (error) {
      console.error("Failed to load jobs:", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load jobs");
      setCurrentJob(emptyJobForm(CURRENT_JOB_ID));
      setPastJobs([]);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // ------------------------------------------------------------------ save
  const patchJob = useCallback((id: string, patch: Partial<JobFormState>) => {
    if (id === CURRENT_JOB_ID) setCurrentJob((prev) => (prev ? { ...prev, ...patch } : prev));
    else setPastJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
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
          savedCurrentRef.current = toJobRecord(job);
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
      let switchedBusinessFrom: JobRecord | null = null;

      const run = (job: JobFormState) => {
        const next = transition(job);
        if (next !== job && next.isDirty) becameDirty = true;
        // Current job moved to a different business: remember the old one so we can offer to keep it.
        if (id === CURRENT_JOB_ID && next.businessSelected && job.business_name && next.business_name !== job.business_name) {
          const saved = savedCurrentRef.current;
          if (saved && saved.business_name === job.business_name) switchedBusinessFrom = saved;
        }
        return next;
      };

      if (id === CURRENT_JOB_ID) setCurrentJob((prev) => (prev ? run(prev) : prev));
      else setPastJobs((prev) => prev.map((j) => (j.id === id ? run(j) : j)));

      if (switchedBusinessFrom) setPreviousJobOffer(switchedBusinessFrom);
      if (becameDirty) scheduleSave(id);
    },
    [scheduleSave],
  );

  // ------------------------------------------------------------ past jobs
  const addPastJob = () => setPastJobs((prev) => [...prev, emptyJobForm(newTempId())]);

  /** Hide a real past job (row kept), or wipe a draft. Only update the screen once the database agrees. */
  const removePastJob = useCallback(
    async (id: string) => {
      const timer = saveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(id);

      const job = pastJobsRef.current.find((j) => j.id === id);
      const dropLocally = () => setPastJobs((prev) => prev.filter((j) => j.id !== id));

      if (!job || isTempId(id)) {
        dropLocally();
        return;
      }

      try {
        if (isJobFormComplete(job)) await hidePastJob(deviceId, id);
        else await wipePastJobs(deviceId, [id]);
        dropLocally();
      } catch (error) {
        console.error("Failed to remove past job:", error);
        toast.error("Couldn't remove that job. Please try again.");
      }
    },
    [deviceId],
  );

  /** Keep the previously saved current job as a past job (after the user switched businesses). */
  const keepPreviousAsPast = useCallback(async () => {
    const record = previousJobOffer;
    setPreviousJobOffer(null);
    if (!record) return;
    try {
      const id = await savePastJob(deviceId, record);
      setPastJobs((prev) => [jobFormFromRecord(id, record), ...prev]);
      toast.success(`Saved ${record.business_name || "your previous job"} to past jobs`);
    } catch (error) {
      console.error("Failed to keep previous job:", error);
      toast.error("Couldn't save the previous job.");
    }
  }, [deviceId, previousJobOffer]);

  // ---------------------------------------------------------- current job
  const retireCurrentJob = useCallback(async () => {
    const timer = saveTimersRef.current.get(CURRENT_JOB_ID);
    if (timer) clearTimeout(timer);
    saveTimersRef.current.delete(CURRENT_JOB_ID);

    const job = currentJobRef.current;
    if (!job || !isJobFormComplete(job)) return;

    setIsRetiring(true);
    try {
      // Make sure the database has the latest edits before moving the row.
      await saveCurrentJob(deviceId, toJobRecord(job));
      const newId = await moveCurrentJobToPast();
      if (!newId) throw new Error("No current job to move");
      setPastJobs((prev) => [jobFormFromRecord(newId, toJobRecord(job)), ...prev]);
      setCurrentJob(emptyJobForm(CURRENT_JOB_ID));
      savedCurrentRef.current = null;
      try {
        localStorage.setItem("job_prompt_skipped", "1"); // don't nag on the next launch
      } catch {
        /* ignore */
      }
      toast.success("Moved to past jobs");
    } catch (error) {
      console.error("Failed to move current job:", error);
      toast.error("Couldn't move the job. Please try again.");
    } finally {
      setIsRetiring(false);
    }
  }, [deviceId]);

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
        <div className="app-card p-6 text-center space-y-3">
          <p className="text-app-black font-medium">Unable to load your jobs. Check your connection and try again.</p>
          <button onClick={loadJobs} className="px-4 py-2 bg-app-yellow text-app-black rounded">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentComplete = isJobFormComplete(currentJob);

  const incompleteBadge = (job: JobFormState) =>
    !isJobFormComplete(job) && jobFormHasContent(job) ? (
      <p className="text-xs text-amber-700 mt-1">Incomplete — fill in the business, role and pay to save this job.</p>
    ) : null;

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
                <div className="flex items-center gap-3">
                  <JobSyncIndicator job={currentJob} />
                  <button
                    onClick={retireCurrentJob}
                    disabled={!currentComplete || isRetiring}
                    title={currentComplete ? "Move this job to your past jobs" : "Complete the job first"}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-app-gray-light text-app-black hover:bg-app-gray-light/70 disabled:opacity-40 transition-colors"
                  >
                    <ArrowDownToLine className="w-3 h-3" />
                    {isRetiring ? "Moving…" : "Move to past jobs"}
                  </button>
                </div>
              </div>

              {previousJobOffer && (
                <div className="mb-3 p-3 rounded-lg border border-app-yellow bg-app-yellow/10 text-sm flex items-center justify-between gap-3">
                  <span>
                    Keep <strong>{previousJobOffer.business_name || "your previous job"}</strong> as a past job?
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={keepPreviousAsPast} className="px-3 py-1 rounded bg-app-yellow text-app-black text-xs">
                      Yes
                    </button>
                    <button onClick={() => setPreviousJobOffer(null)} className="px-3 py-1 rounded bg-app-gray-light text-app-black text-xs">
                      No
                    </button>
                  </div>
                </div>
              )}

              <JobEditor
                job={currentJob}
                onChange={(t) => updateJob(CURRENT_JOB_ID, t)}
                businessPlaceholder="Where do you work?..."
                salaryPlaceholder="$14.00"
              />
              {incompleteBadge(currentJob)}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
              <button onClick={addPastJob} aria-label="Add past job" className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
                <Plus className="w-4 h-4 text-app-black" />
              </button>
            </div>

            {pastJobs.length === 0 && <p className="text-sm text-app-gray-medium mb-2">No past jobs yet. Add one with the + button.</p>}

            <div className="space-y-6">
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
                        title={isJobFormComplete(job) ? "Hide this job" : "Discard this draft"}
                        className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
                      >
                        <Minus className="w-4 h-4 text-app-black" />
                      </button>
                    }
                  />
                  {incompleteBadge(job)}
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
              <MyStories
                onOpenPost={(post) => {
                  onPostClick?.(post);
                  onStoriesClick?.();
                }}
              />
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
