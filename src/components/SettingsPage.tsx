import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Minus, Loader2, AlertCircle } from "lucide-react";
import JobSearchDropdown from "./JobSearchDropdown";
import UnifiedBusinessSearch from "./UnifiedBusinessSearch";
import { isProfane } from "../utils/profanityFilter";
import { useDevice } from "@/contexts/DeviceContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePostsContext } from "./PostsProvider";
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
  salaryDisplay: string; // For tracking what user is typing

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
  salaryDisplay: string; // For tracking what user is typing

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
  const { getUserPostsAndCommented } = usePostsContext();
  const [userPosts, setUserPosts] = useState<Post[]>([]);

  // Also refresh when component mounts - FIXED: empty dependency array
  useEffect(() => {
    const refreshedPosts = getUserPostsAndCommented();
    setUserPosts(refreshedPosts);
  }, []); // Empty dependency array - only run on mount

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

  // Refresh user posts whenever stories section is expanded - FIXED: removed getUserPostsAndCommented from deps
  useEffect(() => {
    if (isStoriesExpanded) {
      const refreshedPosts = getUserPostsAndCommented();
      setUserPosts(refreshedPosts);
      console.log("📖 Refreshed user posts:", refreshedPosts.length);
    }
  }, [isStoriesExpanded]); // Only depend on isStoriesExpanded

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
      // Business is complete if either selected from dropdown OR valid manual address entered
      (job.businessSelected || (job.isManualAddress && job.addressInput && isValidAddress(job.addressInput)))
    );
  };

  const isPastJobComplete = (job: PastJobState): boolean => {
    return !!(
      job.salary > 0 &&
      job.role.trim() &&
      job.location.trim() &&
      job.time_period &&
      // Business is complete if either selected from dropdown OR valid manual address entered
      (job.businessSelected || (job.addressInput && isValidAddress(job.addressInput)))
    );
  };

  // ==================== DATABASE OPERATIONS ====================

  const loadJobsFromDatabase = useCallback(async () => {
    if (!deviceId) {
      console.log("⏳ No deviceId yet, waiting...");
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      console.log("🔄 Loading jobs from database for device:", deviceId);

      // Load current job with deviceId
      const currentJobData = await getCurrentJob(deviceId);
      console.log("📥 Raw current job data:", JSON.stringify(currentJobData, null, 2));

      if (currentJobData) {
        const isManualAddress = currentJobData.business_name === currentJobData.location;
        const salary = currentJobData.salary || 0;
        const newCurrentJob = {
          role: currentJobData.role || "",
          salary: salary,
          location: currentJobData.location || "",
          business_name: currentJobData.business_name || "",
          time_period: currentJobData.time_period || "HR",
          businessInput: currentJobData.business_name || "",
          businessSelected: true, // Mark as selected since it came from database
          showAddressInput: false,
          addressInput: isManualAddress ? currentJobData.location || "" : "",
          addressError: "",
          isManualAddress,
          salaryDisplay: salary > 0 ? `$${salary.toFixed(2)}` : "",
          isDirty: false,
          isSaving: false,
          hasError: false,
          lastSavedAt: new Date(),
        };
        console.log("✅ Setting current job state:", newCurrentJob);
        setCurrentJob(newCurrentJob);
      } else {
        console.log("ℹ️ No current job found, initializing empty");
        // Initialize one empty current job
        setCurrentJob({
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
          isManualAddress: false,
          salaryDisplay: "",
          isDirty: false,
          isSaving: false,
          hasError: false,
        });
      }

      // Load past jobs with deviceId
      const pastJobsData = await getPastJobs(deviceId);
      console.log("📥 Past jobs loaded:", pastJobsData.length, "jobs");

      if (pastJobsData.length > 0) {
        // Filter out incomplete jobs, but keep at least one (empty) job
        const completeJobs = pastJobsData.filter(
          (job) => job.role && job.salary > 0 && job.location && job.time_period,
        );

        if (completeJobs.length > 0) {
          // We have complete jobs - show only those
          const formattedJobs: PastJobState[] = completeJobs.map((job) => {
            const isManualAddress = job.business_name === job.location;
            const salary = job.salary || 0;
            return {
              id: job.id!,
              role: job.role,
              salary: salary,
              location: job.location || "",
              business_name: job.business_name || "",
              time_period: job.time_period || "HR",
              businessInput: job.business_name || "",
              businessSelected: true, // Mark as selected since it came from database
              showAddressInput: false,
              addressInput: isManualAddress ? job.location || "" : "",
              addressError: "",
              salaryDisplay: salary > 0 ? `$${salary.toFixed(2)}` : "",
              isDirty: false,
              isSaving: false,
              hasError: false,
              lastSavedAt: new Date(),
              isCollapsed: false,
            };
          });
          setPastJobs(formattedJobs);
        } else {
          // All jobs incomplete - show one empty job
          console.log("ℹ️ All past jobs incomplete, showing one empty job");
          const newJobId = `temp_${Date.now()}`;
          setPastJobs([createEmptyPastJob(newJobId)]);
        }
      } else {
        console.log("ℹ️ No past jobs found, initializing one empty job");
        // Start with one empty past job
        const newJobId = `temp_${Date.now()}`;
        setPastJobs([createEmptyPastJob(newJobId)]);
      }
    } catch (error: any) {
      console.error("❌ Failed to load jobs:", error);
      setLoadError(error?.message || "Failed to load jobs");
      // Initialize with empty jobs on error
      setCurrentJob({
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
        isManualAddress: false,
        salaryDisplay: "",
        isDirty: false,
        isSaving: false,
        hasError: false,
      });
      const newJobId = `temp_${Date.now()}`;
      setPastJobs([createEmptyPastJob(newJobId)]);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  const saveCurrentJobToDatabase = useCallback(
    async (job: CurrentJobState) => {
      if (!deviceId) {
        console.log("❌ No deviceId available for saving");
        return;
      }

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

        await saveCurrentJob(deviceId, jobData);

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

        // Call legacy callback (temporarily disabled to debug map issue)
        // if (onJobUpdate) {
        //   onJobUpdate({
        //     salary: `${job.salary}`,
        //     role: job.role,
        //     location: job.location,
        //     businessName: job.business_name,
        //     timePeriod: job.time_period,
        //   });
        // }
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
    [deviceId, onJobUpdate],
  );

  const savePastJobToDatabase = useCallback(
    async (job: PastJobState) => {
      if (!deviceId) {
        console.log("❌ No deviceId available for saving");
        return;
      }

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

        const savedId = await savePastJob(deviceId, jobData);

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
    },
    [deviceId],
  );

  const deletePastJobFromDatabase = useCallback(
    async (jobId: string) => {
      if (!deviceId) {
        console.log("❌ No deviceId available for deletion");
        return;
      }

      const job = pastJobs.find((j) => j.id === jobId);
      if (!job) return;

      // Only delete from database if it has a real ID
      if (!jobId.startsWith("temp_")) {
        try {
          await deletePastJob(deviceId, jobId);
        } catch (error) {
          console.error("Failed to delete past job:", error);
        }
      }

      setPastJobs((prev) => prev.filter((j) => j.id !== jobId));
    },
    [deviceId, pastJobs],
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

  // ==================== SALARY FORMATTING ====================

  const formatSalaryDisplay = (salary: number): string => {
    if (salary === 0) return "";
    return `$${salary.toFixed(2)}`;
  };

  const parseSalaryInput = (value: string): number => {
    // Remove everything except numbers and decimal point
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

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

  const handleCurrentJobSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1]?.length > 2) value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    const displayValue = value ? `$${value}` : '';
    const numericValue = parseFloat(value) || 0;
    
    // Direct state update like InitiationPage does
    setCurrentJob((prev) => {
      if (!prev) return prev;
      return { 
        ...prev, 
        salary: numericValue, 
        salaryDisplay: displayValue,
        isDirty: true
      };
    });
    
    // Schedule auto-save separately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setCurrentJob((prev) => {
        if (prev && isCurrentJobComplete(prev)) {
          saveCurrentJobToDatabase(prev);
        }
        return prev;
      });
    }, AUTO_SAVE_DELAY);
  };

  const handleCurrentJobSalaryBlur = () => {
    // Format to 2 decimal places on blur
    if (currentJob && currentJob.salary > 0) {
      const formattedValue = currentJob.salary.toFixed(2);
      setCurrentJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          salaryDisplay: `$${formattedValue}`,
          isDirty: true
        };
      });
    }
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
      showAddressInput: true, // Always show address input when typing
      addressError: "",
      // Don't clear the address input - keep what user has entered
    });
  };

  const handleCurrentJobBusinessSelect = (business: any) => {
    updateCurrentJob({
      businessInput: business.name || business.location,
      businessSelected: true,
      showAddressInput: false, // Hide address input only when business is selected
      addressInput: "", // Clear address when selecting from dropdown
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

    // Address is valid - save it but DON'T mark business as selected
    // Keep showing address input with valid address
    updateCurrentJob({
      location: address,
      business_name: currentJob.businessInput || address,
      isManualAddress: true,
      addressError: "",
      showAddressInput: true, // Keep showing the address input
      businessSelected: false, // DON'T mark as selected - only dropdown selection does this
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
    salaryDisplay: "",
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

  const handlePastJobSalaryChange = (jobId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1]?.length > 2) value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    const displayValue = value ? `$${value}` : '';
    const numericValue = parseFloat(value) || 0;
    
    // Direct state update like InitiationPage does
    setPastJobs((prev) => 
      prev.map((job) => 
        job.id === jobId 
          ? { ...job, salary: numericValue, salaryDisplay: displayValue, isDirty: true }
          : job
      )
    );
    
    // Schedule auto-save separately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const job = pastJobs.find(j => j.id === jobId);
      if (job && isPastJobComplete(job)) {
        savePastJobToDatabase(job);
      }
    }, AUTO_SAVE_DELAY);
  };

  const handlePastJobSalaryBlur = (jobId: string) => {
    // Format to 2 decimal places on blur
    const job = pastJobs.find((j) => j.id === jobId);
    if (job && job.salary > 0) {
      const formattedValue = job.salary.toFixed(2);
      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, salaryDisplay: `$${formattedValue}`, isDirty: true }
            : j
        )
      );
    }
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
      showAddressInput: true, // Always show address input when typing
      addressError: "",
      // Don't clear the address input - keep what user has entered
    });
  };

  const handlePastJobBusinessSelect = (jobId: string, business: any) => {
    updatePastJob(jobId, {
      businessInput: business.name || business.location,
      businessSelected: true,
      showAddressInput: false, // Hide address input only when business is selected
      addressInput: "", // Clear address when selecting from dropdown
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
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                addressError: "Please enter a business address",
              }
            : j,
        ),
      );
      return;
    }
    if (!validateProfanity(address)) {
      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                addressError: "Invalid address content",
              }
            : j,
        ),
      );
      return;
    }
    if (!isValidAddress(address)) {
      setPastJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                addressError: 'Please enter a valid street address (e.g., "123 Main St, City, State")',
              }
            : j,
        ),
      );
      return;
    }

    // Address is valid - save it but DON'T mark business as selected
    // Keep showing address input with valid address
    updatePastJob(jobId, {
      location: address,
      business_name: job.businessInput || address,
      addressError: "",
      showAddressInput: true, // Keep showing the address input
      businessSelected: false, // DON'T mark as selected - only dropdown selection does this
    });
  };

  const handlePastJobTimePeriodChange = (jobId: string, value: string) => {
    updatePastJob(jobId, { time_period: value });
  };

  // ==================== EFFECTS ====================

  // Load jobs on mount
  useEffect(() => {
    if (deviceId) {
      loadJobsFromDatabase();
    }
  }, [deviceId, loadJobsFromDatabase]);

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
    return null;
  }

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
      <div
        ref={scrollContainerRef}
        className="app-card p-6 animate-fade-in flex flex-col max-h-[80vh] overflow-y-auto relative"
      >
        <div className="flex-1 overflow-y-auto pr-2">
          <h1 className="text-xl font-medium text-app-black mb-2">Welcome to workaround! 😊</h1>

          <p className="text-xl text-app-black mb-2">
            <span className="font-medium">Tip:</span>{" "}
            <span className="font-light opacity-70">
              Use the search bar on the map to search businesses by keyword, roles, and pay.
            </span>
          </p>

          {/* Current Job */}
          {currentJob && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-app-black">Current Job</h2>
                {currentJob.isSaving && <Loader2 className="w-4 h-4 animate-spin text-app-gray-medium" />}
                {currentJob.hasError && (
                  <div title={currentJob.errorMessage}>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
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
                    inputMode="decimal"
                    value={currentJob.salaryDisplay}
                    onChange={handleCurrentJobSalaryChange}
                    onBlur={handleCurrentJobSalaryBlur}
                    className="app-input flex-1"
                    placeholder="$14.00"
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
                    {job.hasError && (
                      <div title={job.errorMessage}>
                        <AlertCircle className="w-3 h-3 text-red-500" />
                      </div>
                    )}
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
                      inputMode="decimal"
                      value={job.salaryDisplay}
                      onChange={(e) => handlePastJobSalaryChange(job.id, e)}
                      onBlur={() => handlePastJobSalaryBlur(job.id)}
                      className="app-input flex-1"
                      placeholder="$17.00"
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
              className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
            >
              <h3 className="text-lg font-medium text-app-black">My Stories 📖</h3>
              <span className="text-sm text-app-gray-medium">
                {isStoriesExpanded ? '▼' : '▶'}
              </span>
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
                        onClick={() => {
                          onPostClick?.(post);
                          onStoriesClick?.();
                        }}
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
