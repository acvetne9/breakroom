import React, { useState, useEffect, useRef } from "react";
import { Plus, Minus } from "lucide-react";
import JobSearchDropdown from "./JobSearchDropdown";
import UnifiedBusinessSearch from "./UnifiedBusinessSearch";
import { isProfane } from "../utils/profanityFilter";
import { useDevice } from "@/contexts/DeviceContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePosts } from "@/hooks/usePosts";
import { getPastJobs, savePastJob, deletePastJob } from "@/services/pastJobs";
import { getCurrentJob, saveCurrentJob } from "@/services/currentJobs";
import { PastJobState, CurrentJobState } from "@/types/jobState";
import {
  dbJobToState,
  dbCurrentJobToState,
  createEmptyPastJob,
  stateToPastJobData,
  stateToCurrentJobData,
  replaceJobId,
  isTempId,
} from "@/utils/jobStateHelpers";

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

  // Scrollable container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Unified state objects
  const [currentJobState, setCurrentJobState] = useState<CurrentJobState | null>(null);
  const [pastJobStates, setPastJobStates] = useState<PastJobState[]>([]);

  // UI state
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(true);

  // Refs for cleanup on unmount
  const currentJobStateRef = useRef(currentJobState);
  const pastJobStatesRef = useRef(pastJobStates);

  useEffect(() => {
    currentJobStateRef.current = currentJobState;
  }, [currentJobState]);

  useEffect(() => {
    pastJobStatesRef.current = pastJobStates;
  }, [pastJobStates]);

  // Load jobs from database on mount
  useEffect(() => {
    const loadJobs = async () => {
      try {
        console.log("🔄 Loading jobs from database...");
        setJobsLoading(true);

        // Load current job
        const currentJobData = await getCurrentJob();
        if (currentJobData) {
          setCurrentJobState(dbCurrentJobToState(currentJobData));
        }

        // Load past jobs
        const pastJobsData = await getPastJobs();
        const pastJobsStates = pastJobsData.map(job => dbJobToState(job as any));
        setPastJobStates(pastJobsStates);

        console.log("✅ Jobs loaded successfully");
      } catch (error) {
        console.error("❌ Error loading jobs:", error);
      } finally {
        setJobsLoading(false);
      }
    };

    loadJobs();
  }, []);

  // Save dirty jobs on unmount
  useEffect(() => {
    return () => {
      const saveAllDirtyJobs = async () => {
        try {
          // Save current job if dirty
          if (currentJobStateRef.current?.isDirty) {
            const jobData = stateToCurrentJobData(currentJobStateRef.current);
            await saveCurrentJob(jobData);
          }

          // Save all dirty past jobs
          const dirtyJobs = pastJobStatesRef.current.filter(job => job.isDirty && !isTempId(job.id));
          for (const job of dirtyJobs) {
            const jobData = stateToPastJobData(job);
            await savePastJob(jobData);
          }
        } catch (error) {
          console.error("Error saving jobs on unmount:", error);
        }
      };

      saveAllDirtyJobs();
      onPageLeave?.();
    };
  }, [onPageLeave]);

  // =========================
  // Current Job Handlers
  // =========================

  const updateCurrentJobField = <K extends keyof CurrentJobState>(
    field: K,
    value: CurrentJobState[K]
  ) => {
    if (!currentJobState) return;
    setCurrentJobState(prev => prev ? { ...prev, [field]: value, isDirty: true } : null);
  };

  const handleCurrentJobBusinessInputChange = (value: string) => {
    updateCurrentJobField("businessInput", value);
  };

  const handleCurrentJobBusinessSelect = (business: any) => {
    if (!currentJobState) return;
    
    const fullLocation = business.formatted_address || business.vicinity || business.address || "";
    const businessName = business.name || "";

    setCurrentJobState(prev => prev ? {
      ...prev,
      businessInput: businessName,
      location: fullLocation,
      business_name: businessName,
      businessSelected: true,
      showAddressInput: false,
      address: "",
      addressError: "",
      isManualAddress: false,
      isDirty: true,
    } : null);
  };

  const handleCurrentJobBusinessBlur = () => {
    if (!currentJobState) return;
    
    if (!currentJobState.businessInput.trim()) {
      setCurrentJobState(prev => prev ? {
        ...prev,
        businessSelected: false,
        showAddressInput: false,
      } : null);
    } else if (!currentJobState.businessSelected) {
      setCurrentJobState(prev => prev ? {
        ...prev,
        showAddressInput: true,
      } : null);
    }
  };

  const handleCurrentJobAddressChange = (value: string) => {
    updateCurrentJobField("address", value);
    if (currentJobState?.addressError) {
      updateCurrentJobField("addressError", "");
    }
  };

  const handleCurrentJobAddressBlur = () => {
    if (!currentJobState) return;
    
    const address = currentJobState.address.trim();
    if (!address) {
      setCurrentJobState(prev => prev ? { ...prev, addressError: "Please enter an address" } : null);
      return;
    }

    // Validate address format
    const hasStreetNumber = /\d/.test(address);
    const hasStreetType = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place)\b/i.test(address);
    
    if (!hasStreetNumber || !hasStreetType) {
      setCurrentJobState(prev => prev ? {
        ...prev,
        addressError: "Please include street number and type (e.g., St, Ave, Rd)",
      } : null);
      return;
    }

    setCurrentJobState(prev => prev ? {
      ...prev,
      location: address,
      business_name: address,
      businessSelected: true,
      showAddressInput: false,
      addressError: "",
      isManualAddress: true,
      isDirty: true,
    } : null);
  };

  const handleCurrentJobRoleBlur = () => {
    if (!currentJobState?.role.trim()) return;
    
    if (isProfane(currentJobState.role)) {
      alert("Please avoid using profanity in job titles");
      setCurrentJobState(prev => prev ? { ...prev, role: "" } : null);
    }
  };

  // =========================
  // Past Job Handlers
  // =========================

  const addPastJob = async () => {
    const newJob = createEmptyPastJob();
    setPastJobStates(prev => [...prev, newJob]);

    // Immediately save to get real ID
    try {
      const savedJob = await savePastJob(stateToPastJobData(newJob));
      setPastJobStates(prev =>
        prev.map(job =>
          job.id === newJob.id ? { ...job, ...replaceJobId(job, savedJob.id), isDirty: false, lastSavedAt: new Date() } : job
        )
      );
    } catch (error) {
      console.error("Failed to save new past job:", error);
    }
  };

  const removePastJob = async (id: string) => {
    // If it's a real database job, delete it
    if (!isTempId(id)) {
      try {
        await deletePastJob(id);
      } catch (error) {
        console.error("Failed to delete past job:", error);
      }
    }

    // Remove from state
    setPastJobStates(prev => prev.filter(job => job.id !== id));
  };

  const updatePastJob = (id: string, field: keyof PastJobState, value: any) => {
    setPastJobStates(prev =>
      prev.map(job =>
        job.id === id ? { ...job, [field]: value, isDirty: true } : job
      )
    );
  };

  const handlePastJobBusinessInputChange = (id: string, value: string) => {
    updatePastJob(id, "businessInput", value);
  };

  const handlePastJobBusinessSelect = (id: string, business: any) => {
    const fullLocation = business.formatted_address || business.vicinity || business.address || "";
    const businessName = business.name || "";

    setPastJobStates(prev =>
      prev.map(job =>
        job.id === id
          ? {
              ...job,
              businessInput: businessName,
              location: fullLocation,
              business_name: businessName,
              businessSelected: true,
              showAddressInput: false,
              address: "",
              addressError: "",
              isManualAddress: false,
              isDirty: true,
            }
          : job
      )
    );
  };

  const handlePastJobBusinessBlur = (id: string) => {
    const job = pastJobStates.find(j => j.id === id);
    if (!job) return;

    if (!job.businessInput.trim()) {
      setPastJobStates(prev =>
        prev.map(j =>
          j.id === id ? { ...j, businessSelected: false, showAddressInput: false } : j
        )
      );
    } else if (!job.businessSelected) {
      setPastJobStates(prev =>
        prev.map(j => (j.id === id ? { ...j, showAddressInput: true } : j))
      );
    }
  };

  const handlePastJobAddressChange = (id: string, value: string) => {
    setPastJobStates(prev =>
      prev.map(job =>
        job.id === id ? { ...job, address: value, addressError: "" } : job
      )
    );
  };

  const handlePastJobAddressBlur = (id: string) => {
    const job = pastJobStates.find(j => j.id === id);
    if (!job) return;

    const address = job.address.trim();
    if (!address) {
      setPastJobStates(prev =>
        prev.map(j =>
          j.id === id ? { ...j, addressError: "Please enter an address" } : j
        )
      );
      return;
    }

    const hasStreetNumber = /\d/.test(address);
    const hasStreetType = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place)\b/i.test(address);

    if (!hasStreetNumber || !hasStreetType) {
      setPastJobStates(prev =>
        prev.map(j =>
          j.id === id
            ? { ...j, addressError: "Please include street number and type" }
            : j
        )
      );
      return;
    }

    setPastJobStates(prev =>
      prev.map(j =>
        j.id === id
          ? {
              ...j,
              location: address,
              business_name: address,
              businessSelected: true,
              showAddressInput: false,
              addressError: "",
              isManualAddress: true,
              isDirty: true,
            }
          : j
      )
    );
  };

  const handlePastJobRoleBlur = (id: string, role: string) => {
    if (!role.trim()) return;

    if (isProfane(role)) {
      alert("Please avoid using profanity in job titles");
      updatePastJob(id, "role", "");
    }
  };

  // =========================
  // Render
  // =========================

  if (jobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-app-gray-medium">Loading jobs...</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      style={{
        paddingTop: isMobile ? "80px" : "0",
        paddingBottom: isMobile ? "180px" : "0",
      }}
      className="min-h-screen pb-20"
    >
      <div className="px-8 py-6">
        {/* Current Job Section */}
        {currentJobState && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-app-black mb-4">Current Job</h2>
            <div className="space-y-3">
              {/* Business Location */}
              <div>
                <UnifiedBusinessSearch
                  value={currentJobState.businessInput}
                  onChange={(value) => handleCurrentJobBusinessInputChange(value)}
                  onBusinessSelect={handleCurrentJobBusinessSelect}
                  onBlur={handleCurrentJobBusinessBlur}
                  className={`app-input w-full ${
                    currentJobState.showAddressInput && !currentJobState.businessSelected
                      ? "border-red-500"
                      : ""
                  }`}
                  placeholder="Where do you work?..."
                  variant="dropdown"
                />

                {currentJobState.showAddressInput && !currentJobState.businessSelected && (
                  <div className="mt-2 space-y-2">
                    <p className="text-app-gray-medium text-xs">
                      Can't find your business? Enter the address below:
                    </p>
                    <input
                      type="text"
                      placeholder="Enter business address..."
                      className={`app-input w-full ${
                        currentJobState.addressError ? "border-red-500 border-2" : ""
                      }`}
                      value={currentJobState.address}
                      onChange={(e) => handleCurrentJobAddressChange(e.target.value)}
                      onBlur={handleCurrentJobAddressBlur}
                    />
                    {currentJobState.addressError && (
                      <p className="text-red-500 text-sm px-1">{currentJobState.addressError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Role */}
              <JobSearchDropdown
                value={currentJobState.role}
                onChange={(value) => updateCurrentJobField("role", value)}
                onBlur={handleCurrentJobRoleBlur}
                placeholder="Search or select a job role..."
                className="app-input w-full"
              />

              {/* Salary + Time Period */}
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Salary"
                  className="app-input flex-1"
                  value={currentJobState.salary || ""}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d]/g, "");
                    updateCurrentJobField("salary", value ? parseInt(value) : 0);
                  }}
                  style={{
                    border: "2px solid hsl(var(--app-gray-light))",
                    borderRadius: "0.5rem",
                    height: "48px",
                    fontSize: "16px",
                  }}
                />
                <select
                  value={currentJobState.time_period}
                  onChange={(e) => updateCurrentJobField("time_period", e.target.value)}
                  className="app-input"
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
              </div>
            </div>
          </div>
        )}

        {/* Past Jobs Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
            <button
              onClick={addPastJob}
              className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
            >
              <Plus className="w-4 h-4 text-app-black" />
            </button>
          </div>
          <div className="space-y-4">
            {pastJobStates.map((job) => (
              <div key={job.id} className="space-y-3 w-full">
                {/* Business Location */}
                <div>
                  <UnifiedBusinessSearch
                    value={job.businessInput}
                    onChange={(value) => handlePastJobBusinessInputChange(job.id, value)}
                    onBusinessSelect={(business) => handlePastJobBusinessSelect(job.id, business)}
                    onBlur={() => handlePastJobBusinessBlur(job.id)}
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
                        placeholder="Enter business address..."
                        className={`app-input w-full ${
                          job.addressError ? "border-red-500 border-2" : ""
                        }`}
                        value={job.address}
                        onChange={(e) => handlePastJobAddressChange(job.id, e.target.value)}
                        onBlur={() => handlePastJobAddressBlur(job.id)}
                      />
                      {job.addressError && (
                        <p className="text-red-500 text-sm px-1">{job.addressError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Role */}
                <JobSearchDropdown
                  value={job.role}
                  onChange={(value) => updatePastJob(job.id, "role", value)}
                  onBlur={() => handlePastJobRoleBlur(job.id, job.role)}
                  placeholder="Search or select a job role..."
                  className="app-input w-full"
                />

                {/* Salary + Time Period + Remove Button */}
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Salary"
                    className="app-input flex-1"
                    value={job.salary || ""}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, "");
                      updatePastJob(job.id, "salary", value ? parseInt(value) : 0);
                    }}
                    style={{
                      border: "2px solid hsl(var(--app-gray-light))",
                      borderRadius: "0.5rem",
                      height: "48px",
                      fontSize: "16px",
                    }}
                  />
                  <select
                    value={job.time_period}
                    onChange={(e) => updatePastJob(job.id, "time_period", e.target.value)}
                    className="app-input"
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
                    onClick={() => removePastJob(job.id)}
                    className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    <Minus className="w-4 h-4 text-app-black" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* My Stories & Comments Section */}
        <div className="mt-8">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsStoriesExpanded(!isStoriesExpanded)}
          >
            <h2 className="text-lg font-medium text-app-black">My Stories & Comments</h2>
            <div className="text-app-gray-medium">
              {isStoriesExpanded ? "▲" : "▼"}
            </div>
          </div>

          {isStoriesExpanded && (
            <div className="mt-4 space-y-2">
              {userPosts.length === 0 ? (
                <p className="text-app-gray-medium text-sm">No stories or comments yet</p>
              ) : (
                userPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onPostClick?.(post)}
                    className="p-3 bg-app-gray-lightest rounded-lg cursor-pointer hover:bg-app-gray-light transition-colors"
                  >
                    <p className="text-sm text-app-black line-clamp-2">{post.text}</p>
                    {post.businessName && (
                      <p className="text-xs text-app-gray-medium mt-1">at {post.businessName}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Help Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setShowHelpPopup(true)}
            className="text-app-gray-medium hover:text-app-black transition-colors text-sm"
          >
            Help
          </button>
        </div>

        {/* Help Popup */}
        {showHelpPopup && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowHelpPopup(false)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-medium text-app-black mb-4">Help & Info</h3>
              <p className="text-sm text-app-gray-medium mb-4">
                breakroom is an anonymous platform for sharing workplace experiences. Your job
                information helps us show you relevant stories from others in similar roles.
              </p>
              <a
                href="/privacy-policy"
                className="text-sm text-app-yellow hover:underline"
              >
                Privacy Policy
              </a>
              <button
                onClick={() => setShowHelpPopup(false)}
                className="mt-4 w-full bg-app-yellow text-app-black py-2 rounded-lg font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
