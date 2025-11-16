import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Minus, Loader2, AlertCircle } from "lucide-react";
import JobSearchDropdown from "./JobSearchDropdown";
import UnifiedBusinessSearch from "./UnifiedBusinessSearch";
import { isProfane } from "../utils/profanityFilter";
import { useDevice } from "@/contexts/DeviceContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePosts } from "@/hooks/usePosts";
import { getPastJobs, savePastJob, deletePastJob, type PastJobData } from "@/services/pastJobs";
import { getCurrentJob, saveCurrentJob, deleteCurrentJob, type CurrentJobData } from "@/services/currentJobs";

// Improved state interfaces
interface CurrentJobState {
  // Database fields
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;

  // UI state
  businessInput: string;
  businessSelected: boolean;
  showAddressInput: boolean;
  addressInput: string;
  addressError: string;
  isManualAddress: boolean;

  // Sync state
  isDirty: boolean;
  isSaving: boolean;
  hasError: boolean;
  errorMessage?: string;
  lastSavedAt?: Date;
}

interface PastJobState {
  // Database fields
  id: string;
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;

  // UI state
  businessInput: string;
  businessSelected: boolean;
  showAddressInput: boolean;
  addressInput: string;
  addressError: string;

  // Sync state
  isDirty: boolean;
  isSaving: boolean;
  hasError: boolean;
  errorMessage?: string;
  lastSavedAt?: Date;
  isCollapsed: boolean;
}

interface Post {
  id: string;
  author: string;
  text: string;
  businessName?: string;
  createdAt: Date;
}

interface SettingsPageProps {
  initialData: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    businessName?: string;
    timePeriod?: string;
  };
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onJobUpdate?: (jobData: {
    salary: string;
    role: string;
    location: string;
    businessName?: string;
    timePeriod: string;
  }) => void;
  onPageLeave?: () => void;
  onSearchTrigger?: (searchTerm: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  initialData,
  onStoriesClick,
  onPostClick,
  onJobUpdate,
  onPageLeave,
  onSearchTrigger,
}) => {
  const { deviceId } = useDevice();
  const isMobile = useIsMobile();
  const { getUserPostsAndCommented } = usePosts();
  const userPosts = getUserPostsAndCommented();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Simplified state management
  const [currentJob, setCurrentJob] = useState<CurrentJobState | null>(null);
  const [pastJobs, setPastJobs] = useState<PastJobState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);

  // Auto-save delay (ms)
  const AUTO_SAVE_DELAY = 1000;

  // ==================== VALIDATION ====================

  const isValidAddress = (address: string): boolean => {
    if (!address || address.trim().length < 10) return false;
    const trimmed = address.trim();

    const hasNumbers = /\d/.test(trimmed);
    const hasLetters = /[a-zA-Z]/.test(trimmed);
    const hasSpaces = /\s/.test(trimmed);

    if (!hasNumbers || !hasLetters || !hasSpaces) return false;

    const streetTypes = [
      "street",
      "st",
      "avenue",
      "ave",
      "road",
      "rd",
      "drive",
      "dr",
      "lane",
      "ln",
      "boulevard",
      "blvd",
      "court",
      "ct",
      "place",
      "pl",
      "way",
      "circle",
      "cir",
      "plaza",
      "square",
      "sq",
      "parkway",
      "pkwy",
      "trail",
      "tr",
      "terrace",
      "ter",
      "highway",
      "hwy",
      "loop",
      "row",
      "walk",
      "alley",
      "crescent",
      "cres",
      "grove",
      "heights",
      "hill",
      "park",
      "ridge",
      "view",
      "crossing",
      "xing",
    ];

    const addressLower = trimmed.toLowerCase();
    return streetTypes.some(
      (type) =>
        addressLower.includes(` ${type} `) || addressLower.endsWith(` ${type}`) || addressLower.includes(` ${type},`),
    );
  };

  const validateProfanity = (text: string): boolean => {
    return !isProfane(text);
  };

  const isCurrentJobComplete = (job: CurrentJobState | null): boolean => {
    if (!job) return false;
    return !!(
      job.salary > 0 &&
      job.role.trim() &&
      job.location.trim() &&
      job.time_period &&
      job.businessSelected &&
      (!job.showAddressInput || isValidAddress(job.addressInput))
    );
  };

  const isPastJobComplete = (job: PastJobState): boolean => {
    return !!(
      job.salary > 0 &&
      job.role.trim() &&
      job.location.trim() &&
      job.time_period &&
      job.businessSelected &&
      (!job.showAddressInput || isValidAddress(job.addressInput))
    );
  };

  // ==================== DATABASE OPERATIONS ====================

  const loadJobsFromDatabase = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // Load current job
      const currentJobData = await getCurrentJob();

      if (currentJobData) {
        const isManualAddress = currentJobData.business_name === currentJobData.location;
        setCurrentJob({
          role: currentJobData.role || "",
          salary: currentJobData.salary || 0,
          location: currentJobData.location || "",
          business_name: currentJobData.business_name || "",
          time_period: currentJobData.time_period || "HR",
          businessInput: currentJobData.business_name || currentJobData.location || "",
          businessSelected: !!currentJobData.location,
          showAddressInput: false,
          addressInput: isManualAddress ? currentJobData.location : "",
          addressError: "",
          isManualAddress,
          isDirty: false,
          isSaving: false,
          hasError: false,
          lastSavedAt: new Date(),
        });
      } else {
        // Initialize empty current job
        setCurrentJob({
          role: initialData.role || "",
          salary: initialData.salary ? parseFloat(initialData.salary.replace(/[^0-9.]/g, "")) : 0,
          location: initialData.fullLocation || initialData.location || "",
          business_name: initialData.businessName || initialData.location || "",
          time_period: initialData.timePeriod || "HR",
          businessInput: initialData.businessName || initialData.location || "",
          businessSelected: !!initialData.location,
          showAddressInput: false,
          addressInput: "",
          addressError: "",
          isManualAddress: false,
          isDirty: false,
          isSaving: false,
          hasError: false,
        });
      }

      // Load past jobs
      const pastJobsData = await getPastJobs();

      if (pastJobsData.length > 0) {
        const formattedJobs: PastJobState[] = pastJobsData.map((job) => {
          const isManualAddress = job.business_name === job.location;
          return {
            id: job.id!,
            role: job.role,
            salary: job.salary,
            location: job.location || "",
            business_name: job.business_name || "",
            time_period: job.time_period || "HR",
            businessInput: job.business_name || job.location || "",
            businessSelected: !!job.location,
            showAddressInput: false,
            addressInput: isManualAddress ? job.location || "" : "",
            addressError: "",
            isDirty: false,
            isSaving: false,
            hasError: false,
            lastSavedAt: new Date(),
            isCollapsed: false,
          };
        });
        setPastJobs(formattedJobs);
      } else {
        // Start with one empty past job
        const newJobId = `temp_${Date.now()}`;
        setPastJobs([createEmptyPastJob(newJobId)]);
      }
    } catch (error: any) {
      console.error("Failed to load jobs:", error);
      setLoadError(error?.message || "Failed to load jobs");
      // Initialize with empty jobs on error
      const newJobId = `temp_${Date.now()}`;
      setPastJobs([createEmptyPastJob(newJobId)]);
    } finally {
      setIsLoading(false);
    }
  }, [initialData]);

  const saveCurrentJobToDatabase = useCallback(
    async (job: CurrentJobState) => {
      if (!isCurrentJobComplete(job)) {
        console.log("Current job incomplete, skipping save");
        return;
      }

      setCurrentJob((prev) => (prev ? { ...prev, isSaving: true, hasError: false } : prev));

      try {
        const jobData: CurrentJobData = {
          role: job.role,
          salary: job.salary,
          location: job.location,
          business_name: job.business_name,
          time_period: job.time_period,
        };

        await saveCurrentJob(jobData);

        setCurrentJob((prev) =>
          prev
            ? {
                ...prev,
                isDirty: false,
                isSaving: false,
                hasError: false,
                errorMessage: undefined,
                lastSavedAt: new Date(),
              }
            : prev,
        );

        // Call legacy callback
        if (onJobUpdate) {
          onJobUpdate({
            salary: `$${job.salary}`,
            role: job.role,
            location: job.location,
            businessName: job.business_name,
            timePeriod: job.time_period,
          });
        }
      } catch (error: any) {
        console.error("Failed to save current job:", error);
        setCurrentJob((prev) =>
          prev
            ? {
                ...prev,
                isSaving: false,
                hasError: true,
                errorMessage: error?.message || "Failed to save",
              }
            : prev,
        );
      }
    },
    [onJobUpdate],
  );

  const savePastJobToDatabase = useCallback(async (job: PastJobState) => {
    if (!isPastJobComplete(job)) {
      console.log("Past job incomplete, skipping save:", job.id);
      return;
    }

    setPastJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, isSaving: true, hasError: false } : j)));

    try {
      const jobData: PastJobData = {
        id: job.id.startsWith("temp_") ? undefined : job.id,
        role: job.role,
        salary: job.salary,
        location: job.location,
        business_name: job.business_name,
        time_period: job.time_period,
      };

      const savedId = await savePastJob(jobData);

      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                id: savedId, // Update temp ID with real ID
                isDirty: false,
                isSaving: false,
                hasError: false,
                errorMessage: undefined,
                lastSavedAt: new Date(),
              }
            : j,
        ),
      );
    } catch (error: any) {
      console.error("Failed to save past job:", error);
      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                isSaving: false,
                hasError: true,
                errorMessage: error?.message || "Failed to save",
              }
            : j,
        ),
      );
    }
  }, []);

  const deletePastJobFromDatabase = useCallback(
    async (jobId: string) => {
      const job = pastJobs.find((j) => j.id === jobId);
      if (!job) return;

      // Only delete from database if it has a real ID
      if (!jobId.startsWith("temp_")) {
        try {
          await deletePastJob(jobId);
        } catch (error) {
          console.error("Failed to delete past job:", error);
        }
      }

      setPastJobs((prev) => prev.filter((j) => j.id !== jobId));
    },
    [pastJobs],
  );

  // ==================== AUTO-SAVE ====================

  const scheduleAutoSave = useCallback(
    (job: CurrentJobState | PastJobState, type: "current" | "past") => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule new save
      saveTimeoutRef.current = setTimeout(() => {
        if (type === "current") {
          saveCurrentJobToDatabase(job as CurrentJobState);
        } else {
          savePastJobToDatabase(job as PastJobState);
        }
      }, AUTO_SAVE_DELAY);
    },
    [saveCurrentJobToDatabase, savePastJobToDatabase],
  );

  // ==================== CURRENT JOB HANDLERS ====================

  const updateCurrentJob = useCallback(
    (updates: Partial<CurrentJobState>) => {
      setCurrentJob((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...updates, isDirty: true };
        scheduleAutoSave(updated, "current");
        return updated;
      });
    },
    [scheduleAutoSave],
  );

  const handleCurrentJobSalaryChange = (value: string) => {
    let cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) {
      cleanValue = parts[0] + "." + parts.slice(1).join("");
    }
    if (parts[1] && parts[1].length > 2) {
      cleanValue = parts[0] + "." + parts[1].substring(0, 2);
    }

    updateCurrentJob({ salary: parseFloat(cleanValue) || 0 });
  };

  const handleCurrentJobRoleChange = (value: string) => {
    if (validateProfanity(value)) {
      updateCurrentJob({ role: value });
    }
  };

  const handleCurrentJobBusinessInputChange = (value: string) => {
    updateCurrentJob({
      businessInput: value,
      businessSelected: false,
      showAddressInput: !!value.trim(),
      addressError: "",
    });
  };

  const handleCurrentJobBusinessSelect = (business: any) => {
    updateCurrentJob({
      businessInput: business.name || business.location,
      businessSelected: true,
      showAddressInput: false,
      addressInput: "",
      addressError: "",
      isManualAddress: false,
      location: business.name || business.location,
      business_name: business.name || business.location,
    });
  };

  const handleCurrentJobAddressChange = (value: string) => {
    setCurrentJob((prev) => (prev ? { ...prev, addressInput: value } : prev));
  };

  const handleCurrentJobAddressBlur = () => {
    if (!currentJob) return;

    const address = currentJob.addressInput.trim();
    if (!address) {
      setCurrentJob((prev) =>
        prev
          ? {
              ...prev,
              addressError: "Please enter a business address",
            }
          : prev,
      );
      return;
    }
    if (!validateProfanity(address)) {
      setCurrentJob((prev) =>
        prev
          ? {
              ...prev,
              addressError: "Invalid address content",
            }
          : prev,
      );
      return;
    }
    if (!isValidAddress(address)) {
      setCurrentJob((prev) =>
        prev
          ? {
              ...prev,
              addressError: 'Please enter a valid street address (e.g., "123 Main St, City, State")',
            }
          : prev,
      );
      return;
    }

    updateCurrentJob({
      location: address,
      business_name: currentJob.businessInput,
      businessSelected: true,
      isManualAddress: true,
      addressError: "",
    });
  };

  const handleCurrentJobTimePeriodChange = (value: string) => {
    updateCurrentJob({ time_period: value });
  };

  // ==================== PAST JOB HANDLERS ====================

  const createEmptyPastJob = (id: string): PastJobState => ({
    id,
    role: "",
    salary: 0,
    location: "",
    business_name: "",
    time_period: "HR",
    businessInput: "",
    businessSelected: false,
    showAddressInput: false,
    addressInput: "",
    addressError: "",
    isDirty: false,
    isSaving: false,
    hasError: false,
    isCollapsed: false,
  });

  const updatePastJob = useCallback(
    (jobId: string, updates: Partial<PastJobState>) => {
      setPastJobs((prev) => {
        const updated = prev.map((job) => {
          if (job.id !== jobId) return job;
          const updatedJob = { ...job, ...updates, isDirty: true };
          scheduleAutoSave(updatedJob, "past");
          return updatedJob;
        });
        return updated;
      });
    },
    [scheduleAutoSave],
  );

  const handleAddPastJob = async () => {
    const newJobId = `temp_${Date.now()}`;
    const newJob = createEmptyPastJob(newJobId);
    setPastJobs((prev) => [...prev, newJob]);
  };

  const handleRemovePastJob = (jobId: string) => {
    deletePastJobFromDatabase(jobId);
  };

  const handlePastJobSalaryChange = (jobId: string, value: string) => {
    let cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) {
      cleanValue = parts[0] + "." + parts.slice(1).join("");
    }
    if (parts[1] && parts[1].length > 2) {
      cleanValue = parts[0] + "." + parts[1].substring(0, 2);
    }

    updatePastJob(jobId, { salary: parseFloat(cleanValue) || 0 });
  };

  const handlePastJobRoleChange = (jobId: string, value: string) => {
    if (validateProfanity(value)) {
      updatePastJob(jobId, { role: value });
    }
  };

  const handlePastJobBusinessInputChange = (jobId: string, value: string) => {
    updatePastJob(jobId, {
      businessInput: value,
      businessSelected: false,
      showAddressInput: !!value.trim(),
      addressError: "",
    });
  };

  const handlePastJobBusinessSelect = (jobId: string, business: any) => {
    updatePastJob(jobId, {
      businessInput: business.name || business.location,
      businessSelected: true,
      showAddressInput: false,
      addressInput: "",
      addressError: "",
      location: business.location || business.name,
      business_name: business.name || business.location,
    });
  };

  const handlePastJobAddressChange = (jobId: string, value: string) => {
    setPastJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, addressInput: value } : job)));
  };

  const handlePastJobAddressBlur = (jobId: string) => {
    const job = pastJobs.find((j) => j.id === jobId);
    if (!job) return;

    const address = job.addressInput.trim();
    if (!address) {
      setPastJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, addressError: "Please enter a business address" } : j)),
      );
      return;
    }
    if (!validateProfanity(address)) {
      setPastJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, addressError: "Invalid address content" } : j)));
      return;
    }
    if (!isValidAddress(address)) {
      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, addressError: 'Please enter a valid street address (e.g., "123 Main St, City, State")' }
            : j,
        ),
      );
      return;
    }

    updatePastJob(jobId, {
      location: address,
      business_name: job.businessInput,
      businessSelected: true,
      addressError: "",
    });
  };

  const handlePastJobTimePeriodChange = (jobId: string, value: string) => {
    updatePastJob(jobId, { time_period: value });
  };

  // ==================== EFFECTS ====================

  // Load jobs on mount
  useEffect(() => {
    loadJobsFromDatabase();
  }, [loadJobsFromDatabase]);

  // Cleanup: save all dirty jobs before unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      onPageLeave?.();
    };
  }, [onPageLeave]);

  // Close help popup when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showHelpPopup) {
        setShowHelpPopup(false);
      }
    };

    if (showHelpPopup) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showHelpPopup]);

  // ==================== RENDER ====================

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <div className="app-card p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-app-gray-medium" />
          <span className="text-app-gray-medium">Loading your jobs...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <div className="app-card p-6 flex items-center gap-3 border-red-500">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-red-500 font-medium">Failed to load jobs</p>
            <p className="text-sm text-app-gray-medium">{loadError}</p>
            <button onClick={loadJobsFromDatabase} className="mt-2 text-sm text-app-yellow hover:underline">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="app-card p-6 animate-fade-in flex flex-col max-h-[80vh] overflow-y-auto relative"
      >
        <div className="flex-1 overflow-y-auto pr-2">
          <h1 className="text-xl font-medium text-app-black mb-2">Your Page! 😊</h1>

          {/* Current Job */}
          {currentJob && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-app-black">Current Job</h2>
                {currentJob.isSaving && <Loader2 className="w-4 h-4 animate-spin text-app-gray-medium" />}
                {currentJob.hasError && (
                  <AlertCircle className="w-4 h-4 text-red-500" title={currentJob.errorMessage} />
                )}
              </div>

              <div className="space-y-4">
                {/* Business Location */}
                <div>
                  <UnifiedBusinessSearch
                    value={currentJob.businessInput}
                    onChange={(value) => handleCurrentJobBusinessInputChange(value)}
                    onBusinessSelect={handleCurrentJobBusinessSelect}
                    className={`app-input w-full ${
                      currentJob.showAddressInput && !currentJob.businessSelected ? "border-red-500" : ""
                    }`}
                    placeholder="Where do you work?..."
                    variant="dropdown"
                  />

                  {currentJob.showAddressInput && !currentJob.businessSelected && (
                    <div className="mt-2 space-y-2">
                      <p className="text-app-gray-medium text-xs">Can't find your business? Enter the address below:</p>
                      <input
                        type="text"
                        placeholder="Enter business address (e.g., 123 Main St, City, State)..."
                        className={`app-input w-full ${currentJob.addressError ? "border-red-500 border-2" : ""}`}
                        value={currentJob.addressInput}
                        onChange={(e) => handleCurrentJobAddressChange(e.target.value)}
                        onBlur={handleCurrentJobAddressBlur}
                      />
                      {currentJob.addressError && (
                        <p className="text-red-500 text-sm px-1">{currentJob.addressError}</p>
                      )}
                      <p className="text-gray-500 text-xs px-1">
                        Please include street number, street name, and street type (e.g., St, Ave, Rd)
                      </p>
                    </div>
                  )}
                </div>

                {/* Role */}
                <JobSearchDropdown
                  value={currentJob.role}
                  onChange={handleCurrentJobRoleChange}
                  placeholder="Search or select a job role..."
                  className="app-input w-full"
                />

                {/* Salary + Time Period */}
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={currentJob.salary > 0 ? `$${currentJob.salary}` : ""}
                    onChange={(e) => handleCurrentJobSalaryChange(e.target.value)}
                    className="app-input flex-1"
                    placeholder="$14"
                  />
                  <select
                    value={currentJob.time_period}
                    onChange={(e) => handleCurrentJobTimePeriodChange(e.target.value)}
                    className="px-4 py-3 bg-white text-sm"
                    style={{
                      border: "2px solid hsl(var(--app-gray-light))",
                      borderRadius: "0.5rem",
                      height: "48px",
                      fontSize: "16px",
                    }}
                  >
                    <option value="HR">HR</option>
                    <option value="MO">MO</option>
                    <option value="YR">YR</option>
                  </select>
                  <div className="w-6"></div>
                </div>
              </div>
            </div>
          )}

          {/* Past Jobs */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
              <button
                onClick={handleAddPastJob}
                className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
              >
                <Plus className="w-4 h-4 text-app-black" />
              </button>
            </div>

            <div className="space-y-4">
              {pastJobs.map((job) => (
                <div key={job.id} className="space-y-3 w-full relative">
                  {/* Save/Error Indicator */}
                  <div className="absolute -left-8 top-0 flex items-center gap-1">
                    {job.isSaving && <Loader2 className="w-3 h-3 animate-spin text-app-gray-medium" />}
                    {job.hasError && <AlertCircle className="w-3 h-3 text-red-500" title={job.errorMessage} />}
                  </div>

                  {/* Business Location */}
                  <div>
                    <UnifiedBusinessSearch
                      value={job.businessInput}
                      onChange={(value) => handlePastJobBusinessInputChange(job.id, value)}
                      onBusinessSelect={(business) => handlePastJobBusinessSelect(job.id, business)}
                      className={`app-input w-full ${
                        job.showAddressInput && !job.businessSelected ? "border-red-500" : ""
                      }`}
                      placeholder="Where did you work?..."
                      variant="dropdown"
                    />

                    {job.showAddressInput && !job.businessSelected && (
                      <div className="mt-2 space-y-2">
                        <p className="text-app-gray-medium text-xs">
                          Can't find your business? Enter the address below:
                        </p>
                        <input
                          type="text"
                          placeholder="Enter business address (e.g., 123 Main St, City, State)..."
                          className={`app-input w-full ${job.addressError ? "border-red-500 border-2" : ""}`}
                          value={job.addressInput}
                          onChange={(e) => handlePastJobAddressChange(job.id, e.target.value)}
                          onBlur={() => handlePastJobAddressBlur(job.id)}
                        />
                        {job.addressError && <p className="text-red-500 text-sm px-1">{job.addressError}</p>}
                        <p className="text-gray-500 text-xs px-1">
                          Please include street number, street name, and street type (e.g., St, Ave, Rd)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Role */}
                  <JobSearchDropdown
                    value={job.role}
                    onChange={(value) => handlePastJobRoleChange(job.id, value)}
                    placeholder="Search or select a job role..."
                    className="app-input w-full"
                  />

                  {/* Salary + Time Period + Remove Button */}
                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={job.salary > 0 ? `${job.salary}` : ""}
                      onChange={(e) => handlePastJobSalaryChange(job.id, e.target.value)}
                      className="app-input flex-1"
                      placeholder="$17"
                    />
                    <select
                      value={job.time_period}
                      onChange={(e) => handlePastJobTimePeriodChange(job.id, e.target.value)}
                      className="px-4 py-3 bg-white text-sm"
                      style={{
                        border: "2px solid hsl(var(--app-gray-light))",
                        borderRadius: "0.5rem",
                        height: "48px",
                        fontSize: "16px",
                      }}
                    >
                      <option value="HR">HR</option>
                      <option value="MO">MO</option>
                      <option value="YR">YR</option>
                    </select>
                    <button
                      onClick={() => handleRemovePastJob(job.id)}
                      className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4 text-app-black" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* My Stories & Comments */}
          <div className="mt-8">
            <button
              onClick={() => setIsStoriesExpanded(!isStoriesExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <h3 className="text-lg font-medium text-app-black">My Stories 📖</h3>
            </button>
            {isStoriesExpanded && (
              <div className="mt-4 space-y-2">
                {userPosts.length === 0 ? (
                  <p className="text-app-gray-medium text-sm">
                    No stories or comments yet. Share your workplace experiences!
                  </p>
                ) : (
                  <>
                    {userPosts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
                        onClick={() => onPostClick?.(post)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs text-app-gray-medium">
                            {post.author === "You" ? "Your story" : "Commented on"}
                          </p>
                          {post.businessName && (
                            <span className="text-xs text-app-gray-medium">at {post.businessName}</span>
                          )}
                        </div>
                        <p className="text-app-gray-dark text-sm">
                          {post.text.length > 100 ? `${post.text.substring(0, 100)}...` : post.text}
                        </p>
                      </div>
                    ))}
                    {userPosts.length >= 5 && (
                      <button
                        onClick={onStoriesClick}
                        className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                      >
                        View All Stories & Comments ({userPosts.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Help Button */}
          <div className="mt-8 flex justify-start relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHelpPopup(!showHelpPopup);
                setTimeout(() => {
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                      top: scrollContainerRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }
                }, 100);
              }}
              className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
            >
              ?
            </button>
          </div>

          {/* Help Popup */}
          {showHelpPopup && (
            <div
              className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-app-gray-dark">
                <strong>Disclaimer:</strong> The information presented in this app is based on surveys, user input, and
                publicly available sources. We do not independently verify all information, and it should not be taken
                as factual statements about any individual or organization.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
